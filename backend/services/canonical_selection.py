"""Canonical version selection service."""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from datetime import datetime

from models import Document
from config import settings


class CanonicalSelectionService:
    """Service for selecting canonical (best) versions of documents."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def select_canonical_version(
        self,
        document_group: List[Document],
        criteria: Optional[Dict[str, float]] = None
    ) -> Document:
        """
        Select the canonical (best) version from a group of duplicate/near-duplicate documents.
        
        Args:
            document_group: List of documents to choose from
            criteria: Optional custom criteria weights (overrides config)
        
        Returns:
            The selected canonical document
        """
        if not document_group:
            raise ValueError("Document group cannot be empty")
        
        if len(document_group) == 1:
            return document_group[0]
        
        # Use custom criteria or defaults
        quality_weight = criteria.get('quality_weight', settings.canonical_quality_weight) if criteria else settings.canonical_quality_weight
        recency_weight = criteria.get('recency_weight', settings.canonical_recency_weight) if criteria else settings.canonical_recency_weight
        completeness_weight = criteria.get('completeness_weight', settings.canonical_completeness_weight) if criteria else settings.canonical_completeness_weight
        
        # Normalize weights
        total_weight = quality_weight + recency_weight + completeness_weight
        if total_weight > 0:
            quality_weight /= total_weight
            recency_weight /= total_weight
            completeness_weight /= total_weight
        
        # Score each document
        scored_docs = []
        for doc in document_group:
            score = self._calculate_canonical_score(
                doc,
                quality_weight,
                recency_weight,
                completeness_weight
            )
            scored_docs.append((doc, score))
        
        # Sort by score (highest first)
        scored_docs.sort(key=lambda x: x[1], reverse=True)
        
        return scored_docs[0][0]
    
    def _calculate_canonical_score(
        self,
        doc: Document,
        quality_weight: float,
        recency_weight: float,
        completeness_weight: float
    ) -> float:
        """
        Calculate canonical score for a document.
        
        Returns:
            Score (0-1, higher is better)
        """
        # Quality score (0-1)
        quality_score = self._calculate_quality_score(doc)
        
        # Recency score (0-1)
        recency_score = self._calculate_recency_score(doc)
        
        # Completeness score (0-1)
        completeness_score = self._calculate_completeness_score(doc)
        
        # Weighted combination
        total_score = (
            quality_weight * quality_score +
            recency_weight * recency_score +
            completeness_weight * completeness_score
        )
        
        return total_score
    
    def _calculate_quality_score(self, doc: Document) -> float:
        """Calculate quality score based on processing status and text quality."""
        score = 0.0
        
        # Processing status (highest weight)
        if doc.processing_status == 'completed':
            score += 0.5
        elif doc.processing_status == 'needs_review':
            score += 0.3
        elif doc.processing_status == 'processing':
            score += 0.1
        
        # Text extraction quality
        if doc.extracted_text:
            text_length = len(doc.extracted_text)
            # Prefer documents with substantial text
            if text_length > 1000:
                score += 0.3
            elif text_length > 100:
                score += 0.2
            elif text_length > 0:
                score += 0.1
            
            # Prefer documents without extraction errors
            if doc.metadata_json and 'extraction_error' not in doc.metadata_json:
                score += 0.2
        
        return min(score, 1.0)
    
    def _calculate_recency_score(self, doc: Document) -> float:
        """Calculate recency score based on timestamps."""
        if not settings.canonical_prefer_latest:
            return 0.5  # Neutral if recency not preferred
        
        # Use the most recent timestamp available
        timestamps = []
        if doc.ingested_at:
            timestamps.append(doc.ingested_at)
        if doc.created_at:
            timestamps.append(doc.created_at)
        if doc.modified_date:
            timestamps.append(doc.modified_date)
        
        if not timestamps:
            return 0.5
        
        latest_timestamp = max(timestamps)
        now = datetime.utcnow()
        
        # Calculate days since latest timestamp
        if latest_timestamp.tzinfo:
            delta = (now.replace(tzinfo=latest_timestamp.tzinfo) - latest_timestamp).days
        else:
            delta = (now - latest_timestamp.replace(tzinfo=None)).days
        
        # Score decreases with age (exponential decay)
        # Documents from last 30 days get high score
        if delta <= 30:
            return 1.0
        elif delta <= 90:
            return 0.8
        elif delta <= 180:
            return 0.6
        elif delta <= 365:
            return 0.4
        else:
            return 0.2
    
    def _calculate_completeness_score(self, doc: Document) -> float:
        """Calculate completeness score based on file size and content."""
        score = 0.0
        
        if not settings.canonical_prefer_larger:
            return 0.5  # Neutral if size not preferred
        
        # Get all documents in the same group for comparison
        # For now, use absolute thresholds
        if doc.file_size:
            # Prefer larger files (more complete)
            if doc.file_size > 10 * 1024 * 1024:  # > 10 MB
                score += 0.4
            elif doc.file_size > 1 * 1024 * 1024:  # > 1 MB
                score += 0.3
            elif doc.file_size > 100 * 1024:  # > 100 KB
                score += 0.2
            else:
                score += 0.1
        
        # Text completeness
        if doc.extracted_text:
            text_length = len(doc.extracted_text)
            if text_length > 50000:  # > 50k characters
                score += 0.4
            elif text_length > 10000:  # > 10k characters
                score += 0.3
            elif text_length > 1000:  # > 1k characters
                score += 0.2
            else:
                score += 0.1
        
        # Metadata completeness
        metadata_count = 0
        if doc.author:
            metadata_count += 1
        if doc.title:
            metadata_count += 1
        if doc.created_date:
            metadata_count += 1
        if doc.tags:
            metadata_count += 1
        
        score += min(metadata_count * 0.1, 0.2)
        
        return min(score, 1.0)
    
    def find_duplicate_groups(self, matter_id: str, similarity_threshold: float = None) -> List[List[Document]]:
        """
        Find groups of duplicate/near-duplicate documents.
        
        Returns:
            List of document groups, where each group contains similar documents
        """
        from services.duplicate_detection import DuplicateDetectionService
        
        threshold = similarity_threshold or settings.near_duplicate_threshold
        duplicate_detection = DuplicateDetectionService(self.db)
        
        # Get all current version documents in the matter
        documents = self.db.query(Document).filter(
            and_(
                Document.matter_id == matter_id,
                Document.is_current_version == True,
                Document.extracted_text.isnot(None),
                Document.extracted_text != ''
            )
        ).all()
        
        # Build similarity graph
        groups = []
        processed = set()
        
        for i, doc1 in enumerate(documents):
            if doc1.id in processed:
                continue
            
            # Start a new group
            group = [doc1]
            processed.add(doc1.id)
            
            # Find all similar documents
            for doc2 in documents[i+1:]:
                if doc2.id in processed:
                    continue
                
                comparison = duplicate_detection.compare_documents(doc1, doc2)
                if comparison['similarity_score'] >= threshold:
                    group.append(doc2)
                    processed.add(doc2.id)
            
            # Only add groups with 2+ documents
            if len(group) > 1:
                groups.append(group)
        
        return groups
    
    def set_canonical_version(self, document_group: List[Document]) -> Document:
        """
        Select and mark canonical version for a group of documents.
        
        Returns:
            The canonical document
        """
        canonical = self.select_canonical_version(document_group)
        
        # Mark canonical version
        for doc in document_group:
            # Update metadata to indicate canonical status
            if doc.metadata_json is None:
                doc.metadata_json = {}
            elif not isinstance(doc.metadata_json, dict):
                # Handle case where metadata might be JSONB string or other type
                doc.metadata_json = {}
            
            # Ensure metadata is a dict
            if not isinstance(doc.metadata_json, dict):
                doc.metadata_json = {}
            
            doc.metadata_json['is_canonical'] = (doc.id == canonical.id)
            doc.metadata_json['canonical_document_id'] = str(canonical.id)
            if doc.id != canonical.id:
                doc.metadata_json['canonical_selected_at'] = datetime.utcnow().isoformat()
        
        self.db.commit()
        
        return canonical

