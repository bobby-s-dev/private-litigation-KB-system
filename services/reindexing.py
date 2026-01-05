"""Reindexing service for updating embeddings when documents or models change."""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models import Document, EmbeddingsMetadata
from services.indexing import IndexingService
from services.qdrant_client import QdrantService
from config import settings


class ReindexingService:
    """Service for reindexing documents."""
    
    def __init__(self, db: Session):
        self.db = db
        self.indexing_service = IndexingService(db)
        self.qdrant_service = QdrantService()
    
    def reindex_by_model(
        self,
        old_model: str,
        new_model: Optional[str] = None
    ) -> Dict:
        """
        Reindex all documents that were indexed with a specific model.
        
        Args:
            old_model: Old embedding model name
            new_model: New embedding model (uses config if None)
        
        Returns:
            Reindexing results
        """
        new_model = new_model or settings.embedding_model
        
        # Find all documents indexed with old model
        embeddings = self.db.query(EmbeddingsMetadata).filter(
            EmbeddingsMetadata.embedding_model == old_model
        ).distinct(EmbeddingsMetadata.document_id).all()
        
        document_ids = [str(emb.document_id) for emb in embeddings]
        
        if not document_ids:
            return {
                'success': True,
                'message': f'No documents found with model {old_model}',
                'documents_reindexed': 0
            }
        
        # Reindex each document
        results = self.indexing_service.index_batch(
            document_ids,
            force_reindex=True
        )
        
        return {
            'success': True,
            'old_model': old_model,
            'new_model': new_model,
            'documents_found': len(document_ids),
            'reindexing_results': results
        }
    
    def reindex_by_matter(
        self,
        matter_id: str,
        force_reindex: bool = True
    ) -> Dict:
        """
        Reindex all documents in a matter.
        
        Args:
            matter_id: Matter ID
            force_reindex: Force reindex even if already indexed
        
        Returns:
            Reindexing results
        """
        # Get all current version documents in matter
        documents = self.db.query(Document).filter(
            and_(
                Document.matter_id == matter_id,
                Document.is_current_version == True,
                Document.extracted_text.isnot(None),
                Document.extracted_text != ''
            )
        ).all()
        
        document_ids = [str(doc.id) for doc in documents]
        
        if not document_ids:
            return {
                'success': True,
                'message': f'No documents found for matter {matter_id}',
                'documents_reindexed': 0
            }
        
        results = self.indexing_service.index_batch(
            document_ids,
            force_reindex=force_reindex
        )
        
        return {
            'success': True,
            'matter_id': matter_id,
            'reindexing_results': results
        }
    
    def reindex_by_document_type(
        self,
        document_type: str,
        force_reindex: bool = True
    ) -> Dict:
        """
        Reindex all documents of a specific type.
        
        Args:
            document_type: Document type (pdf, docx, etc.)
            force_reindex: Force reindex even if already indexed
        
        Returns:
            Reindexing results
        """
        documents = self.db.query(Document).filter(
            and_(
                Document.document_type == document_type,
                Document.is_current_version == True,
                Document.extracted_text.isnot(None),
                Document.extracted_text != ''
            )
        ).all()
        
        document_ids = [str(doc.id) for doc in documents]
        
        if not document_ids:
            return {
                'success': True,
                'message': f'No documents found of type {document_type}',
                'documents_reindexed': 0
            }
        
        results = self.indexing_service.index_batch(
            document_ids,
            force_reindex=force_reindex
        )
        
        return {
            'success': True,
            'document_type': document_type,
            'reindexing_results': results
        }
    
    def handle_version_update(
        self,
        old_document_id: str,
        new_document_id: str
    ) -> Dict:
        """
        Handle embedding updates when a document version changes.
        
        Args:
            old_document_id: Old version document ID
            new_document_id: New version document ID
        
        Returns:
            Update results
        """
        # Delete old version embeddings
        delete_result = self.indexing_service.delete_document_index(old_document_id)
        
        # Index new version
        index_result = self.indexing_service.index_document(new_document_id)
        
        return {
            'success': delete_result.get('success') and index_result.get('success'),
            'old_document_id': old_document_id,
            'new_document_id': new_document_id,
            'delete_result': delete_result,
            'index_result': index_result
        }
    
    def cleanup_orphaned_embeddings(self) -> Dict:
        """
        Clean up embeddings for documents that no longer exist or are not current versions.
        
        Returns:
            Cleanup results
        """
        # Find all embedding metadata
        all_embeddings = self.db.query(EmbeddingsMetadata).filter(
            EmbeddingsMetadata.document_id.isnot(None)
        ).all()
        
        orphaned_count = 0
        deleted_points = []
        
        for emb in all_embeddings:
            # Check if document exists and is current version
            document = self.db.query(Document).filter(
                and_(
                    Document.id == emb.document_id,
                    Document.is_current_version == True
                )
            ).first()
            
            if not document:
                # Document doesn't exist or is not current version
                orphaned_count += 1
                deleted_points.append(emb.qdrant_point_id)
                
                # Delete from Qdrant
                self.qdrant_service.delete_points(
                    emb.qdrant_collection_name,
                    [emb.qdrant_point_id]
                )
                
                # Delete from database
                self.db.delete(emb)
        
        if orphaned_count > 0:
            self.db.commit()
        
        return {
            'success': True,
            'orphaned_embeddings_found': orphaned_count,
            'deleted_points': len(deleted_points)
        }
    
    def get_indexing_statistics(self) -> Dict:
        """Get statistics about indexing."""
        # Count total embeddings
        total_embeddings = self.db.query(EmbeddingsMetadata).count()
        
        # Count by model
        from sqlalchemy import func
        embeddings_by_model = self.db.query(
            EmbeddingsMetadata.embedding_model,
            func.count(EmbeddingsMetadata.id).label('count')
        ).group_by(EmbeddingsMetadata.embedding_model).all()
        
        # Count by collection
        embeddings_by_collection = self.db.query(
            EmbeddingsMetadata.qdrant_collection_name,
            func.count(EmbeddingsMetadata.id).label('count')
        ).group_by(EmbeddingsMetadata.qdrant_collection_name).all()
        
        # Count unique documents indexed
        unique_documents = self.db.query(
            func.count(func.distinct(EmbeddingsMetadata.document_id))
        ).filter(EmbeddingsMetadata.document_id.isnot(None)).scalar()
        
        return {
            'total_embeddings': total_embeddings,
            'unique_documents_indexed': unique_documents or 0,
            'embeddings_by_model': {
                model: count for model, count in embeddings_by_model
            },
            'embeddings_by_collection': {
                coll: count for coll, count in embeddings_by_collection
            }
        }

