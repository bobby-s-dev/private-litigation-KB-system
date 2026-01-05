"""Main ingestion service that orchestrates document processing."""
from pathlib import Path
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import uuid
import mimetypes
from datetime import datetime

from models import Document, Matter, AuditLog
from services.file_storage import FileStorageService
from services.hashing import HashingService
from services.text_extraction import TextExtractionService
from services.duplicate_detection import DuplicateDetectionService
from services.version_management import VersionManagementService
from services.metadata_extraction import MetadataExtractionService
from config import settings


class IngestionService:
    """Main service for ingesting documents."""
    
    def __init__(self, db: Session, ingestion_run_id: Optional[str] = None):
        self.db = db
        self.ingestion_run_id = ingestion_run_id or str(uuid.uuid4())
        self.file_storage = FileStorageService()
        self.hashing_service = HashingService()
        self.text_extraction = TextExtractionService()
        self.duplicate_detection = DuplicateDetectionService(db)
        self.version_management = VersionManagementService(db)
        self.metadata_extraction = MetadataExtractionService()
    
    def ingest_file(
        self,
        file_path: Path,
        matter_id: str,
        filename: Optional[str] = None,
        document_type: Optional[str] = None,
        user_id: Optional[str] = None,
        tags: Optional[list] = None,
        categories: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Ingest a single file.
        
        Returns:
            Dict with ingestion results including document_id, status, and duplicate info
        """
        result = {
            'success': False,
            'document_id': None,
            'status': 'pending',
            'is_duplicate': False,
            'is_new_version': False,
            'existing_document_id': None,
            'version_number': 1,
            'error': None,
            'ingestion_run_id': self.ingestion_run_id,
        }
        
        try:
            # Verify matter exists
            matter = self.db.query(Matter).filter(Matter.id == matter_id).first()
            if not matter:
                result['error'] = f"Matter {matter_id} not found"
                return result
            
            # Get file info
            filename = filename or file_path.name
            file_size = self.file_storage.get_file_size(file_path)
            mime_type, _ = mimetypes.guess_type(str(file_path))
            
            # Determine document type
            if not document_type:
                document_type = self._infer_document_type(file_path, mime_type)
            
            # Compute hashes
            sha256_hash, md5_hash = self.hashing_service.compute_file_hashes(file_path)
            
            # Check for exact duplicate
            existing_doc = self.duplicate_detection.find_exact_duplicate(sha256_hash, matter_id)
            
            if existing_doc:
                result['success'] = True
                result['document_id'] = str(existing_doc.id)
                result['is_duplicate'] = True
                result['existing_document_id'] = str(existing_doc.id)
                result['status'] = 'duplicate'
                result['version_number'] = existing_doc.version_number
                return result
            
            # Extract text
            extraction_result = self.text_extraction.extract_text(file_path, mime_type)
            raw_text = extraction_result.get('raw_text', '')
            extracted_text = extraction_result.get('extracted_text', '')
            extraction_metadata = extraction_result.get('metadata', {})
            
            # Check for near-duplicates and potential version parent
            near_duplicates = []
            potential_version_parent = None
            similarity_score = 0.0
            if extracted_text:
                near_duplicates = self.duplicate_detection.find_near_duplicates(
                    extracted_text, 
                    matter_id
                )
                
                # Check if highest similarity near-duplicate might be a version
                # If similarity is very high (>= 0.95), treat as potential version
                if near_duplicates:
                    best_match, similarity_score = near_duplicates[0]
                    if similarity_score >= 0.95:
                        # High similarity suggests this might be a version update
                        potential_version_parent = best_match
            
            # Generate document ID for file storage (needed for both version and new document paths)
            document_id = uuid.uuid4()
            
            # Handle version linking if potential version parent found
            if potential_version_parent:
                # Check if this should be treated as a new version
                # Compare filenames - if same or very similar, likely a version
                filename_similarity = self._compare_filenames(filename, potential_version_parent.file_name)
                
                if filename_similarity >= 0.8:  # Similar filenames suggest version
                    # Create new version instead of new document
                    try:
                        # Move file to processed directory
                        processed_path = self.file_storage.move_to_processed(
                            file_path,
                            matter_id,
                            str(document_id),
                            filename
                        )
                        
                        # Get relative path
                        try:
                            relative_path = str(processed_path.relative_to(self.file_storage.storage_root))
                        except ValueError:
                            relative_path = str(processed_path)
                        
                        # Create new version
                        new_version = self.version_management.create_new_version(
                            existing_doc=potential_version_parent,
                            new_file_path=relative_path,
                            new_text=extracted_text,
                            new_hash_sha256=sha256_hash,
                            new_hash_md5=md5_hash,
                            change_description=f"New version uploaded: {filename}"
                        )
                        
                        # Update file path and other fields
                        new_version.file_path = relative_path
                        new_version.file_size = file_size
                        new_version.raw_text = raw_text
                        new_version.extracted_text = extracted_text
                        new_version.text_length = len(extracted_text) if extracted_text else None
                        
                        # Update metadata
                        metadata_result = self.metadata_extraction.extract_metadata(
                            extracted_text,
                            document_type,
                            extraction_metadata
                        )
                        new_version.metadata_json = {
                            'ingestion_run_id': self.ingestion_run_id,
                            'extraction_metadata': extraction_metadata,
                            'extracted_metadata': metadata_result,
                            'is_version': True,
                            'parent_version_id': str(potential_version_parent.id),
                        }
                        
                        # Update tags and categories if provided
                        if tags:
                            new_version.tags = list(set((new_version.tags or []) + tags))
                        if categories:
                            new_version.categories = list(set((new_version.categories or []) + categories))
                        
                        # Extract email-specific metadata
                        if document_type == 'email' and extraction_metadata:
                            new_version.sender_email = extraction_metadata.get('sender') or extraction_metadata.get('from')
                            recipient_emails = []
                            if extraction_metadata.get('to'):
                                recipient_emails.append(extraction_metadata.get('to'))
                            if extraction_metadata.get('cc'):
                                recipient_emails.append(extraction_metadata.get('cc'))
                            if extraction_metadata.get('bcc'):
                                recipient_emails.append(extraction_metadata.get('bcc'))
                            new_version.recipient_emails = recipient_emails if recipient_emails else None
                            received_date = self._parse_date(extraction_metadata.get('date'))
                            new_version.received_date = received_date
                            new_version.sent_date = received_date
                        
                        # Extract author/created date from metadata
                        if extraction_metadata:
                            if 'core_properties' in extraction_metadata:
                                props = extraction_metadata['core_properties']
                                new_version.author = props.get('author')
                                new_version.created_date = self._parse_date(props.get('created'))
                                new_version.modified_date = self._parse_date(props.get('modified'))
                            elif 'author' in extraction_metadata:
                                new_version.author = extraction_metadata.get('author')
                        
                        self.db.flush()
                        
                        # Create audit log
                        audit_entry = AuditLog(
                            action_type='version_created',
                            resource_type='document',
                            resource_id=new_version.id,
                            user_id=uuid.UUID(user_id) if user_id else None,
                            description=f"Created new version of document: {filename}",
                            metadata_json={
                                'ingestion_run_id': self.ingestion_run_id,
                                'parent_document_id': str(potential_version_parent.id),
                                'version_number': new_version.version_number,
                            }
                        )
                        self.db.add(audit_entry)
                        self.db.commit()
                        
                        result['success'] = True
                        result['document_id'] = str(new_version.id)
                        result['is_new_version'] = True
                        result['existing_document_id'] = str(potential_version_parent.id)
                        result['status'] = 'version_created'
                        result['version_number'] = new_version.version_number
                        result['similarity_score'] = similarity_score
                        
                        # Auto-index if enabled
                        if settings.auto_index_on_ingestion:
                            try:
                                from services.indexing import IndexingService
                                indexing_service = IndexingService(self.db)
                                index_result = indexing_service.index_document(str(new_version.id), force_reindex=False)
                                result['indexing'] = {
                                    'indexed': index_result.get('success', False),
                                    'chunks_indexed': index_result.get('chunks_indexed', 0)
                                }
                            except Exception as e:
                                result['indexing'] = {
                                    'indexed': False,
                                    'error': str(e)
                                }
                        
                        return result
                    except Exception as e:
                        # If version creation fails, fall through to create new document
                        self.db.rollback()
                        # Continue with normal document creation using the same document_id
            
            # Move file to processed directory (for new documents, not versions)
            processed_path = self.file_storage.move_to_processed(
                file_path,
                matter_id,
                str(document_id),
                filename
            )
            
            # Store relative path from storage root
            try:
                relative_path = str(processed_path.relative_to(self.file_storage.storage_root))
            except ValueError:
                # If paths aren't related, store absolute path
                relative_path = str(processed_path)
            
            # Extract metadata (stub)
            metadata_result = self.metadata_extraction.extract_metadata(
                extracted_text,
                document_type,
                extraction_metadata
            )
            
            # Prepare document metadata
            doc_metadata = {
                'ingestion_run_id': self.ingestion_run_id,
                'extraction_metadata': extraction_metadata,
                'extracted_metadata': metadata_result,
                'near_duplicates': [
                    {'document_id': str(doc.id), 'similarity': score}
                    for doc, score in near_duplicates[:5]  # Top 5
                ] if near_duplicates else [],
            }
            
            # Extract email-specific metadata
            sender_email = None
            recipient_emails = None
            received_date = None
            sent_date = None
            
            if document_type == 'email' and extraction_metadata:
                sender_email = extraction_metadata.get('sender') or extraction_metadata.get('from')
                recipient_emails = []
                if extraction_metadata.get('to'):
                    recipient_emails.append(extraction_metadata.get('to'))
                if extraction_metadata.get('cc'):
                    recipient_emails.append(extraction_metadata.get('cc'))
                if extraction_metadata.get('bcc'):
                    recipient_emails.append(extraction_metadata.get('bcc'))
                received_date = self._parse_date(extraction_metadata.get('date'))
                sent_date = received_date
            
            # Extract author/created date from metadata
            author = None
            created_date = None
            modified_date = None
            
            if extraction_metadata:
                if 'core_properties' in extraction_metadata:
                    props = extraction_metadata['core_properties']
                    author = props.get('author')
                    created_date = self._parse_date(props.get('created'))
                    modified_date = self._parse_date(props.get('modified'))
                elif 'author' in extraction_metadata:
                    author = extraction_metadata.get('author')
            
            # Create document
            document = Document(
                id=document_id,
                matter_id=matter_id,
                document_type=document_type,
                title=filename,  # Can be updated later
                file_name=filename,
                file_path=relative_path,
                file_size=file_size,
                mime_type=mime_type,
                file_hash_sha256=sha256_hash,
                file_hash_md5=md5_hash,
                raw_text=raw_text,
                extracted_text=extracted_text,
                text_length=len(extracted_text) if extracted_text else None,
                author=author,
                created_date=created_date,
                modified_date=modified_date,
                received_date=received_date,
                sent_date=sent_date,
                sender_email=sender_email,
                recipient_emails=recipient_emails if recipient_emails else None,
                tags=tags or [],
                categories=categories or [],
                processing_status='completed',
                processed_at=datetime.utcnow(),
                ingested_by=uuid.UUID(user_id) if user_id else None,
                metadata_json=doc_metadata,
            )
            
            self.db.add(document)
            self.db.flush()
            
            # Create initial version record
            from models import DocumentVersion
            version = DocumentVersion(
                document_id=document_id,
                version_number=1,
                file_hash_sha256=sha256_hash,
                file_hash_md5=md5_hash,
                file_path=str(processed_path),
                file_size=file_size,
                change_type='initial',
                similarity_score=1.0,
                content_changed=False,
                metadata_changed=False,
            )
            self.db.add(version)
            
            # Create audit log entry
            audit_entry = AuditLog(
                action_type='import',
                resource_type='document',
                resource_id=document_id,
                user_id=uuid.UUID(user_id) if user_id else None,
                description=f"Imported document: {filename}",
                metadata_json={
                    'ingestion_run_id': self.ingestion_run_id,
                    'file_size': file_size,
                    'document_type': document_type,
                }
            )
            self.db.add(audit_entry)
            
            self.db.commit()
            
            # Auto-index if enabled
            if settings.auto_index_on_ingestion:
                try:
                    from services.indexing import IndexingService
                    indexing_service = IndexingService(self.db)
                    index_result = indexing_service.index_document(str(document_id), force_reindex=False)
                    result['indexing'] = {
                        'indexed': index_result.get('success', False),
                        'chunks_indexed': index_result.get('chunks_indexed', 0)
                    }
                except Exception as e:
                    # Don't fail ingestion if indexing fails
                    result['indexing'] = {
                        'indexed': False,
                        'error': str(e)
                    }
            
            result['success'] = True
            result['document_id'] = str(document_id)
            result['status'] = 'completed'
            result['version_number'] = 1
            result['near_duplicates_found'] = len(near_duplicates)
            
        except Exception as e:
            self.db.rollback()
            result['error'] = str(e)
            result['status'] = 'failed'
        
        return result
    
    def _infer_document_type(self, file_path: Path, mime_type: Optional[str]) -> str:
        """Infer document type from file extension and MIME type."""
        ext = file_path.suffix.lower()
        
        type_map = {
            '.pdf': 'pdf',
            '.docx': 'docx',
            '.doc': 'docx',
            '.msg': 'email',
            '.eml': 'email',
            '.txt': 'note',
            '.csv': 'financial_record',
            '.xlsx': 'financial_record',
            '.xls': 'financial_record',
        }
        
        if ext in type_map:
            return type_map[ext]
        
        if mime_type:
            if 'pdf' in mime_type:
                return 'pdf'
            elif 'word' in mime_type or 'document' in mime_type:
                return 'docx'
            elif 'message' in mime_type or 'email' in mime_type:
                return 'email'
            elif 'image' in mime_type:
                return 'note'  # Images become notes after OCR
        
        return 'other'
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse date string to datetime."""
        if not date_str:
            return None
        
        try:
            # Try ISO format
            if 'T' in date_str:
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            # Try other formats as needed
            return None
        except Exception:
            return None
    
    def _compare_filenames(self, filename1: str, filename2: str) -> float:
        """Compare two filenames and return similarity score (0-1)."""
        from difflib import SequenceMatcher
        
        # Normalize filenames (remove paths, lowercase)
        name1 = Path(filename1).stem.lower()
        name2 = Path(filename2).stem.lower()
        
        # Use SequenceMatcher for similarity
        return SequenceMatcher(None, name1, name2).ratio()

