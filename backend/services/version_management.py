"""Version management service for document versioning."""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
import uuid

from models import Document, DocumentVersion
from services.duplicate_detection import DuplicateDetectionService
from services.hashing import HashingService
from services.canonical_selection import CanonicalSelectionService


class VersionManagementService:
    """Service for managing document versions."""
    
    def __init__(self, db: Session):
        self.db = db
        self.duplicate_detection = DuplicateDetectionService(db)
        self.hashing_service = HashingService()
        self.canonical_selection = CanonicalSelectionService(db)
    
    def create_new_version(
        self,
        existing_doc: Document,
        new_file_path: str,
        new_text: str,
        new_hash_sha256: str,
        new_hash_md5: str,
        change_description: Optional[str] = None
    ) -> Document:
        """
        Create a new version of an existing document.
        
        Returns:
            New document record
        """
        # Mark old version as not current
        existing_doc.is_current_version = False
        
        # Calculate similarity to previous version
        similarity = 1.0  # Default for exact hash match
        if existing_doc.extracted_text and new_text:
            comparison = self.duplicate_detection.compare_documents(existing_doc, existing_doc)
            # Use text similarity if hashes differ
            if new_hash_sha256 != existing_doc.file_hash_sha256:
                from difflib import SequenceMatcher
                similarity = SequenceMatcher(None, existing_doc.extracted_text, new_text).ratio()
        
        # Determine change type
        if new_hash_sha256 == existing_doc.file_hash_sha256:
            change_type = 'duplicate'
        elif similarity >= 0.99:
            change_type = 'correction'
        elif similarity >= 0.95:
            change_type = 'revision'
        else:
            change_type = 'update'
        
        # Create version record for old document
        old_version = DocumentVersion(
            document_id=existing_doc.id,
            version_number=existing_doc.version_number,
            file_hash_sha256=existing_doc.file_hash_sha256,
            file_hash_md5=existing_doc.file_hash_md5,
            file_path=existing_doc.file_path,
            file_size=existing_doc.file_size,
            change_type='initial' if existing_doc.version_number == 1 else 'update',
            similarity_score=1.0,
            content_changed=False,
            metadata_changed=False
        )
        self.db.add(old_version)
        
        # Create new document version
        new_version_number = existing_doc.version_number + 1
        new_doc = Document(
            id=uuid.uuid4(),
            matter_id=existing_doc.matter_id,
            document_type=existing_doc.document_type,
            title=existing_doc.title,
            file_name=existing_doc.file_name,  # Keep same filename
            file_path=new_file_path,
            file_size=existing_doc.file_size,  # Will be updated
            mime_type=existing_doc.mime_type,
            file_hash_sha256=new_hash_sha256,
            file_hash_md5=new_hash_md5,
            raw_text=new_text,
            extracted_text=new_text,
            text_length=len(new_text) if new_text else None,
            parent_document_id=existing_doc.id,
            version_number=new_version_number,
            is_current_version=True,
            processing_status='completed',
            # Copy other fields
            author=existing_doc.author,
            confidentiality_level=existing_doc.confidentiality_level,
            tags=existing_doc.tags,
            categories=existing_doc.categories,
        )
        
        self.db.add(new_doc)
        self.db.flush()  # Flush to get the new document ID
        
        # Create version record for new document
        new_version = DocumentVersion(
            document_id=new_doc.id,
            version_number=new_version_number,
            file_hash_sha256=new_hash_sha256,
            file_hash_md5=new_hash_md5,
            file_path=new_file_path,
            file_size=new_doc.file_size,
            change_type=change_type,
            change_description=change_description,
            similarity_score=similarity,
            content_changed=(new_hash_sha256 != existing_doc.file_hash_sha256),
            metadata_changed=False
        )
        self.db.add(new_version)
        
        return new_doc
    
    def get_version_chain(self, document_id: str) -> list[Document]:
        """
        Get all versions of a document in order.
        
        Returns:
            List of documents ordered by version number
        """
        # Find the root document (no parent)
        root_doc = self.db.query(Document).filter(Document.id == document_id).first()
        if not root_doc:
            return []
        
        # Find the actual root (might be a child version)
        while root_doc.parent_document_id:
            root_doc = self.db.query(Document).filter(
                Document.id == root_doc.parent_document_id
            ).first()
            if not root_doc:
                break
        
        if not root_doc:
            return []
        
        # Get all documents in the version chain
        versions = []
        current = root_doc
        
        while current:
            versions.append(current)
            # Find next version
            current = self.db.query(Document).filter(
                and_(
                    Document.parent_document_id == current.id,
                    Document.version_number == current.version_number + 1
                )
            ).first()
        
        return sorted(versions, key=lambda d: d.version_number)
    
    def get_current_version(self, document_id: str) -> Optional[Document]:
        """Get the current version of a document."""
        doc = self.db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return None
        
        # If this is current, return it
        if doc.is_current_version:
            return doc
        
        # Otherwise, find the current version in the chain
        root_id = doc.id
        while doc.parent_document_id:
            root_id = doc.parent_document_id
            doc = self.db.query(Document).filter(Document.id == root_id).first()
            if not doc:
                break
        
        # Now find current version from root
        return self.db.query(Document).filter(
            and_(
                Document.parent_document_id == root_id,
                Document.is_current_version == True
            )
        ).first() or doc
    
    def get_canonical_version(self, document_id: str) -> Optional[Document]:
        """Get the canonical version for a document (may be different from current)."""
        doc = self.db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return None
        
        # Check if document has canonical metadata
        if doc.metadata and doc.metadata.get('canonical_document_id'):
            canonical_id = doc.metadata.get('canonical_document_id')
            canonical = self.db.query(Document).filter(Document.id == canonical_id).first()
            if canonical:
                return canonical
        
        # If no canonical set, return current version
        return self.get_current_version(document_id)
    
    def ensure_canonical_version(self, document_id: str) -> Document:
        """
        Ensure a canonical version is set for a document group.
        If not set, select and mark one.
        
        Returns:
            The canonical document
        """
        doc = self.db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return None
        
        # Find duplicate group
        duplicate_groups = self.canonical_selection.find_duplicate_groups(doc.matter_id)
        
        # Find which group this document belongs to
        for group in duplicate_groups:
            if any(d.id == doc.id for d in group):
                # Check if canonical is already set
                has_canonical = any(
                    d.metadata and d.metadata.get('is_canonical')
                    for d in group
                )
                
                if not has_canonical:
                    # Set canonical version
                    return self.canonical_selection.set_canonical_version(group)
                else:
                    # Return existing canonical
                    for d in group:
                        if d.metadata and d.metadata.get('is_canonical'):
                            return d
        
        # If not in a duplicate group, return the document itself
        return doc

