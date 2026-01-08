"""Enhanced document organization and classification service."""
from typing import List, Dict, Optional, Set
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime
from collections import defaultdict
import re
import uuid

from models import Document, Matter, Entity, DocumentEntity
from services.metadata_extraction import MetadataExtractionService
from config import settings


class DocumentOrganizationService:
    """Service for automatic document organization, classification, and naming."""
    
    def __init__(self, db: Session):
        self.db = db
        self.metadata_service = MetadataExtractionService()
    
    def classify_document(
        self,
        document: Document,
        text: Optional[str] = None
    ) -> Dict:
        """
        Enhanced document classification.
        
        Returns:
            Dict with classification results including:
            - document_type (refined)
            - categories
            - topics
            - matter_tags
            - suggested_name
        """
        text = text or document.extracted_text or ""
        
        classification = {
            'document_type': document.document_type or 'other',
            'categories': document.categories or [],
            'topics': [],
            'matter_tags': [],
            'suggested_name': None,
            'confidence': 0.7
        }
        
        # Enhanced document type detection
        classification['document_type'] = self._refine_document_type(
            document, text
        )
        
        # Extract categories
        classification['categories'] = self._extract_categories(text, document)
        
        # Extract topics
        classification['topics'] = self._extract_topics(text)
        
        # Extract matter tags
        classification['matter_tags'] = self._extract_matter_tags(text, document.matter_id)
        
        # Generate suggested name
        classification['suggested_name'] = self._generate_suggested_name(
            document, text, classification
        )
        
        return classification
    
    def _refine_document_type(
        self,
        document: Document,
        text: str
    ) -> str:
        """Refine document type based on content analysis."""
        doc_type = document.document_type or 'other'
        text_lower = text.lower()
        
        # Court filing patterns
        filing_keywords = [
            'motion', 'complaint', 'answer', 'response', 'brief', 'memorandum',
            'order', 'judgment', 'opinion', 'pleading', 'petition', 'affidavit'
        ]
        if any(kw in text_lower for kw in filing_keywords):
            return 'court_filing'
        
        # Email patterns
        if doc_type == 'email' or 'from:' in text_lower or 'to:' in text_lower:
            return 'email'
        
        # Financial record patterns
        financial_keywords = [
            'invoice', 'receipt', 'payment', 'transaction', 'balance',
            'account', 'statement', 'ledger', 'expense', 'revenue'
        ]
        if any(kw in text_lower for kw in financial_keywords):
            return 'financial_record'
        
        # Evidence patterns
        evidence_keywords = [
            'exhibit', 'evidence', 'photograph', 'diagram', 'chart',
            'witness statement', 'deposition', 'testimony'
        ]
        if any(kw in text_lower for kw in evidence_keywords):
            return 'evidence'
        
        # Contract patterns
        contract_keywords = [
            'agreement', 'contract', 'terms and conditions', 'party',
            'whereas', 'hereby', 'witnesseth'
        ]
        if any(kw in text_lower for kw in contract_keywords):
            return 'contract'
        
        return doc_type
    
    def _extract_categories(
        self,
        text: str,
        document: Document
    ) -> List[str]:
        """Extract categories from document content."""
        categories = set(document.categories or [])
        text_lower = text.lower()
        
        # Legal categories
        if any(kw in text_lower for kw in ['hearing', 'trial', 'court', 'judge']):
            categories.add('legal_proceeding')
        
        if any(kw in text_lower for kw in ['deadline', 'due date', 'must be filed']):
            categories.add('deadline')
        
        if any(kw in text_lower for kw in ['contract', 'agreement', 'terms']):
            categories.add('contract')
        
        if any(kw in text_lower for kw in ['evidence', 'exhibit', 'witness']):
            categories.add('evidence')
        
        # Financial categories
        if any(kw in text_lower for kw in ['payment', 'invoice', 'transaction', 'financial']):
            categories.add('financial')
        
        # Communication categories
        if document.document_type == 'email':
            categories.add('communication')
        
        return list(categories)
    
    def _extract_topics(self, text: str) -> List[str]:
        """Extract topics from document content."""
        topics = []
        text_lower = text.lower()
        
        # Topic keywords
        topic_keywords = {
            'medical': ['medical', 'health', 'treatment', 'diagnosis', 'patient', 'doctor', 'hospital'],
            'financial': ['financial', 'payment', 'cost', 'expense', 'revenue', 'account'],
            'legal': ['legal', 'court', 'lawsuit', 'case', 'litigation', 'attorney'],
            'contract': ['contract', 'agreement', 'terms', 'party'],
            'employment': ['employee', 'employer', 'workplace', 'job', 'salary', 'wage'],
            'real_estate': ['property', 'real estate', 'land', 'building', 'lease', 'rent'],
            'intellectual_property': ['patent', 'trademark', 'copyright', 'ip', 'intellectual property']
        }
        
        for topic, keywords in topic_keywords.items():
            if any(kw in text_lower for kw in keywords):
                topics.append(topic)
        
        return topics
    
    def _extract_matter_tags(
        self,
        text: str,
        matter_id: Optional[str]
    ) -> List[str]:
        """Extract matter/case tags from document."""
        tags = []
        
        # Extract case numbers
        case_numbers = self.metadata_service._extract_case_numbers(text)
        tags.extend(case_numbers)
        
        # Extract matter reference if available
        if matter_id:
            matter = self.db.query(Matter).filter(Matter.id == matter_id).first()
            if matter:
                if matter.case_number:
                    tags.append(matter.case_number)
                if matter.matter_number:
                    tags.append(matter.matter_number)
        
        return list(set(tags))
    
    def _generate_suggested_name(
        self,
        document: Document,
        text: str,
        classification: Dict
    ) -> str:
        """
        Generate a consistent, descriptive name for the document.
        
        Format: [Type]_[Date]_[KeyInfo]_[OriginalName]
        """
        parts = []
        
        # Document type prefix
        doc_type = classification['document_type']
        type_prefix = {
            'email': 'Email',
            'court_filing': 'Filing',
            'financial_record': 'Financial',
            'evidence': 'Evidence',
            'contract': 'Contract',
            'pdf': 'Document',
            'docx': 'Document'
        }.get(doc_type, 'Doc')
        parts.append(type_prefix)
        
        # Date
        date_str = None
        if document.received_date:
            date_str = document.received_date.strftime('%Y%m%d')
        elif document.created_date:
            date_str = document.created_date.strftime('%Y%m%d')
        elif document.ingested_at:
            date_str = document.ingested_at.strftime('%Y%m%d')
        
        if date_str:
            parts.append(date_str)
        
        # Key information (case number, entity, etc.)
        key_info = []
        
        # Case number
        if classification['matter_tags']:
            key_info.append(classification['matter_tags'][0][:10])
        
        # Sender/Author
        if document.sender_email:
            sender_name = document.sender_email.split('@')[0]
            key_info.append(sender_name[:15])
        elif document.author:
            key_info.append(document.author[:15])
        
        if key_info:
            parts.append('_'.join(key_info[:2]))  # Max 2 key info items
        
        # Original filename (sanitized, truncated)
        original_name = document.file_name
        # Remove extension
        if '.' in original_name:
            original_name = '.'.join(original_name.split('.')[:-1])
        # Sanitize
        original_name = re.sub(r'[^a-zA-Z0-9_-]', '_', original_name)
        original_name = original_name[:30]  # Truncate
        
        if original_name and original_name not in ' '.join(parts):
            parts.append(original_name)
        
        suggested = '_'.join(parts)
        
        # Add extension if original had one
        if '.' in document.file_name:
            ext = document.file_name.split('.')[-1]
            suggested += f'.{ext}'
        
        return suggested
    
    def group_documents_by_issue(
        self,
        matter_id: str,
        documents: Optional[List[Document]] = None
    ) -> Dict[str, List[Dict]]:
        """
        Group documents by issue/topic.
        
        Returns:
            Dict mapping issue names to lists of documents
        """
        if documents is None:
            documents = self.db.query(Document).filter(
                and_(
                    Document.matter_id == matter_id,
                    Document.is_current_version == True
                )
            ).all()
        
        groups = defaultdict(list)
        
        for doc in documents:
            # Get classification
            classification = self.classify_document(doc)
            
            # Group by primary category or topic
            if classification['categories']:
                primary_category = classification['categories'][0]
                groups[primary_category].append({
                    'id': str(doc.id),
                    'title': doc.title or doc.file_name,
                    'file_name': doc.file_name,
                    'document_type': doc.document_type,
                    'classification': classification
                })
            elif classification['topics']:
                primary_topic = classification['topics'][0]
                groups[primary_topic].append({
                    'id': str(doc.id),
                    'title': doc.title or doc.file_name,
                    'file_name': doc.file_name,
                    'document_type': doc.document_type,
                    'classification': classification
                })
            else:
                groups['other'].append({
                    'id': str(doc.id),
                    'title': doc.title or doc.file_name,
                    'file_name': doc.file_name,
                    'document_type': doc.document_type,
                    'classification': classification
                })
        
        return dict(groups)
    
    def apply_naming_convention(
        self,
        document: Document,
        convention: str = 'standard'
    ) -> str:
        """
        Apply consistent naming convention to document.
        
        Conventions:
        - 'standard': Type_Date_KeyInfo_Original
        - 'simple': Date_Original
        - 'descriptive': Type_KeyInfo_Date_Original
        """
        classification = self.classify_document(document)
        
        if convention == 'simple':
            # Date_Original
            date_str = None
            if document.received_date:
                date_str = document.received_date.strftime('%Y%m%d')
            elif document.created_date:
                date_str = document.created_date.strftime('%Y%m%d')
            
            original = document.file_name
            if '.' in original:
                original = '.'.join(original.split('.')[:-1])
            
            if date_str:
                return f"{date_str}_{original}"
            return original
        
        elif convention == 'descriptive':
            # Type_KeyInfo_Date_Original
            parts = []
            
            # Type
            doc_type = classification['document_type']
            type_map = {
                'email': 'Email',
                'court_filing': 'Filing',
                'financial_record': 'Financial',
                'evidence': 'Evidence',
                'contract': 'Contract'
            }
            parts.append(type_map.get(doc_type, 'Doc'))
            
            # Key info
            if classification['matter_tags']:
                parts.append(classification['matter_tags'][0][:10])
            
            # Date
            if document.received_date:
                parts.append(document.received_date.strftime('%Y%m%d'))
            
            # Original
            original = document.file_name
            if '.' in original:
                ext = original.split('.')[-1]
                original = '.'.join(original.split('.')[:-1])
                parts.append(original)
                return '_'.join(parts) + f'.{ext}'
            else:
                parts.append(original)
                return '_'.join(parts)
        
        else:  # standard
            return classification['suggested_name'] or document.file_name

