"""Duplicate detection service for exact and near-duplicate detection."""
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from difflib import SequenceMatcher
from Levenshtein import ratio as levenshtein_ratio

from models import Document
from services.hashing import HashingService
from config import settings


class DuplicateDetectionService:
    """Service for detecting exact and near-duplicate documents."""
    
    def __init__(self, db: Session):
        self.db = db
        self.hashing_service = HashingService()
        self.exact_threshold = settings.exact_duplicate_threshold
        self.near_threshold = settings.near_duplicate_threshold
    
    def find_exact_duplicate(self, file_hash_sha256: str, matter_id: str) -> Optional[Document]:
        """
        Find exact duplicate by hash.
        
        Returns:
            Existing document if exact duplicate found, None otherwise
        """
        return self.db.query(Document).filter(
            and_(
                Document.file_hash_sha256 == file_hash_sha256,
                Document.matter_id == matter_id,
                Document.is_current_version == True
            )
        ).first()
    
    def find_near_duplicates(
        self, 
        text: str, 
        matter_id: str, 
        exclude_document_id: Optional[str] = None
    ) -> List[Tuple[Document, float]]:
        """
        Find near-duplicate documents by text similarity.
        
        Returns:
            List of tuples (document, similarity_score) sorted by similarity (highest first)
        """
        if not text or len(text.strip()) < 100:  # Skip if text too short
            return []
        
        # Get all documents in the matter with extracted text
        query = self.db.query(Document).filter(
            and_(
                Document.matter_id == matter_id,
                Document.is_current_version == True,
                Document.extracted_text.isnot(None),
                Document.extracted_text != ''
            )
        )
        
        if exclude_document_id:
            query = query.filter(Document.id != exclude_document_id)
        
        candidates = query.all()
        
        similarities = []
        text_length = len(text)
        
        for doc in candidates:
            if not doc.extracted_text:
                continue
            
            # Use multiple similarity metrics
            similarity = self._calculate_similarity(text, doc.extracted_text, text_length, len(doc.extracted_text))
            
            if similarity >= self.near_threshold:
                similarities.append((doc, similarity))
        
        # Sort by similarity (highest first)
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        return similarities
    
    def _calculate_similarity(
        self, 
        text1: str, 
        text2: str, 
        len1: int, 
        len2: int
    ) -> float:
        """
        Calculate similarity between two texts using multiple methods.
        
        Returns:
            Combined similarity score (0-1)
        """
        if not text1 or not text2:
            return 0.0
        
        # Method 1: SequenceMatcher (good for longer texts)
        seq_similarity = SequenceMatcher(None, text1, text2).ratio()
        
        # Method 2: Levenshtein ratio (good for shorter texts)
        lev_similarity = levenshtein_ratio(text1, text2)
        
        # Method 3: Length-based similarity (penalize very different lengths)
        length_ratio = min(len1, len2) / max(len1, len2) if max(len1, len2) > 0 else 0
        
        # Combined score (weighted average)
        # SequenceMatcher gets more weight for longer texts
        if max(len1, len2) > 1000:
            combined = (0.5 * seq_similarity) + (0.3 * lev_similarity) + (0.2 * length_ratio)
        else:
            combined = (0.3 * seq_similarity) + (0.5 * lev_similarity) + (0.2 * length_ratio)
        
        return combined
    
    def compare_documents(self, doc1: Document, doc2: Document) -> dict:
        """
        Compare two documents and return detailed comparison.
        
        Returns:
            Dict with comparison results
        """
        result = {
            'exact_duplicate': False,
            'near_duplicate': False,
            'similarity_score': 0.0,
            'hash_match': False,
            'text_similarity': 0.0,
            'length_ratio': 0.0,
        }
        
        # Check hash match
        if doc1.file_hash_sha256 and doc2.file_hash_sha256:
            result['hash_match'] = doc1.file_hash_sha256 == doc2.file_hash_sha256
            result['exact_duplicate'] = result['hash_match']
        
        # Check text similarity
        if doc1.extracted_text and doc2.extracted_text:
            text1 = doc1.extracted_text
            text2 = doc2.extracted_text
            len1 = len(text1)
            len2 = len(text2)
            
            result['text_similarity'] = self._calculate_similarity(text1, text2, len1, len2)
            result['length_ratio'] = min(len1, len2) / max(len1, len2) if max(len1, len2) > 0 else 0
            result['similarity_score'] = result['text_similarity']
            result['near_duplicate'] = result['similarity_score'] >= self.near_threshold
        
        return result

