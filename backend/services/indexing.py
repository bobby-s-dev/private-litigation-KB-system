"""Document indexing service for chunking, embedding, and storing in Qdrant."""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_
import uuid

from models import Document, EmbeddingsMetadata
from services.chunking import ChunkingService, Chunk
from services.embedding import EmbeddingService
from services.qdrant_client import QdrantService
from config import settings


class IndexingService:
    """Service for indexing documents into Qdrant."""
    
    def __init__(self, db: Session):
        self.db = db
        self.chunking_service = ChunkingService(
            strategy=settings.chunking_strategy,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
            min_chunk_size=settings.min_chunk_size,
            max_chunk_size=settings.max_chunk_size,
            respect_sentence_boundaries=settings.respect_sentence_boundaries,
            respect_paragraph_boundaries=settings.respect_paragraph_boundaries
        )
        self.embedding_service = EmbeddingService()
        self.qdrant_service = QdrantService()
        self.collection_name = self._get_collection_name()
    
    def _get_collection_name(self) -> str:
        """Get collection name based on embedding model."""
        # Use model name in collection name for versioning
        model_safe = settings.embedding_model.replace('/', '_').replace('-', '_')
        return f"documents_{model_safe}"
    
    def index_document(
        self,
        document_id: str,
        force_reindex: bool = False
    ) -> Dict:
        """
        Index a document: chunk, embed, and store in Qdrant.
        
        Args:
            document_id: Document ID to index
            force_reindex: If True, delete existing embeddings and reindex
        
        Returns:
            Dict with indexing results
        """
        # Get document
        document = self.db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return {
                'success': False,
                'error': 'Document not found',
                'document_id': document_id
            }
        
        # Check if already indexed
        existing_embeddings = self.db.query(EmbeddingsMetadata).filter(
            EmbeddingsMetadata.document_id == document_id
        ).all()
        
        if existing_embeddings and not force_reindex:
            return {
                'success': True,
                'message': 'Document already indexed',
                'document_id': document_id,
                'chunks_indexed': len(existing_embeddings),
                'skipped': True
            }
        
        # Delete existing embeddings if reindexing
        if force_reindex and existing_embeddings:
            self._delete_document_embeddings(document_id)
        
        # Check if document has text
        if not document.extracted_text:
            return {
                'success': False,
                'error': 'Document has no extracted text',
                'document_id': document_id
            }
        
        try:
            # Ensure collection exists
            embedding_dim = self.embedding_service.get_embedding_dimension()
            self.qdrant_service.ensure_collection(
                collection_name=self.collection_name,
                vector_size=embedding_dim
            )
            
            # Chunk document
            document_metadata = {
                'document_id': str(document.id),
                'document_type': document.document_type,
                'matter_id': str(document.matter_id),
                'title': document.title,
                'file_name': document.file_name,
            }
            
            chunks = self.chunking_service.chunk_text(
                document.extracted_text,
                document_id=str(document.id),
                document_metadata=document_metadata
            )
            
            if not chunks:
                return {
                    'success': False,
                    'error': 'No chunks generated',
                    'document_id': document_id
                }
            
            # Generate embeddings
            chunk_texts = [chunk.text for chunk in chunks]
            embeddings = self.embedding_service.generate_embeddings_batch(
                chunk_texts,
                batch_size=settings.batch_indexing_size
            )
            
            # Filter out failed embeddings
            valid_chunks = []
            valid_embeddings = []
            for chunk, embedding in zip(chunks, embeddings):
                if embedding is not None:
                    valid_chunks.append(chunk)
                    valid_embeddings.append(embedding)
            
            if not valid_chunks:
                return {
                    'success': False,
                    'error': 'Failed to generate embeddings',
                    'document_id': document_id
                }
            
            # Prepare points for Qdrant
            points = []
            embedding_metadata_records = []
            
            for chunk, embedding in zip(valid_chunks, valid_embeddings):
                point_id = uuid.uuid4()
                
                # Create payload
                payload = {
                    'document_id': str(document.id),
                    'matter_id': str(document.matter_id),
                    'chunk_index': chunk.chunk_index,
                    'chunk_text': chunk.text,
                    'start_position': chunk.start_position,
                    'end_position': chunk.end_position,
                    'document_type': document.document_type,
                    'file_name': document.file_name,
                    'title': document.title or document.file_name,
                }
                
                # Add chunk metadata
                if chunk.metadata:
                    payload.update(chunk.metadata)
                
                # Create Qdrant point
                points.append(
                    PointStruct(
                        id=point_id,
                        vector=embedding,
                        payload=payload
                    )
                )
                
                # Create embedding metadata record
                embedding_metadata = EmbeddingsMetadata(
                    id=uuid.uuid4(),
                    document_id=document.id,
                    qdrant_collection_name=self.collection_name,
                    qdrant_point_id=str(point_id),
                    embedding_model=settings.embedding_model,
                    embedding_dimension=len(embedding),
                    chunk_text=chunk.text,
                    chunk_index=chunk.chunk_index,
                    chunk_start_position=chunk.start_position,
                    chunk_end_position=chunk.end_position,
                    metadata_json=chunk.metadata or {}
                )
                embedding_metadata_records.append(embedding_metadata)
            
            # Upsert points to Qdrant
            success = self.qdrant_service.upsert_points(
                collection_name=self.collection_name,
                points=points
            )
            
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to upsert points to Qdrant',
                    'document_id': document_id
                }
            
            # Save embedding metadata to database
            for em in embedding_metadata_records:
                self.db.add(em)
            
            self.db.commit()
            
            return {
                'success': True,
                'document_id': document_id,
                'chunks_indexed': len(valid_chunks),
                'chunks_failed': len(chunks) - len(valid_chunks),
                'collection_name': self.collection_name,
                'embedding_model': settings.embedding_model,
                'embedding_dimension': embedding_dim
            }
        
        except Exception as e:
            self.db.rollback()
            return {
                'success': False,
                'error': str(e),
                'document_id': document_id
            }
    
    def _delete_document_embeddings(self, document_id: str):
        """Delete all embeddings for a document."""
        # Get embedding metadata
        embeddings = self.db.query(EmbeddingsMetadata).filter(
            EmbeddingsMetadata.document_id == document_id
        ).all()
        
        if not embeddings:
            return
        
        # Group by collection
        collections = {}
        for emb in embeddings:
            coll_name = emb.qdrant_collection_name
            if coll_name not in collections:
                collections[coll_name] = []
            collections[coll_name].append(emb.qdrant_point_id)
        
        # Delete from Qdrant
        for coll_name, point_ids in collections.items():
            self.qdrant_service.delete_points(coll_name, point_ids)
        
        # Delete from database
        for emb in embeddings:
            self.db.delete(emb)
        
        self.db.commit()
    
    def delete_document_index(self, document_id: str) -> Dict:
        """Delete all embeddings for a document."""
        try:
            self._delete_document_embeddings(document_id)
            return {
                'success': True,
                'document_id': document_id,
                'message': 'Document index deleted'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'document_id': document_id
            }
    
    def reindex_document(self, document_id: str) -> Dict:
        """Reindex a document (delete and recreate)."""
        return self.index_document(document_id, force_reindex=True)
    
    def index_batch(
        self,
        document_ids: List[str],
        force_reindex: bool = False
    ) -> Dict:
        """
        Index multiple documents in batch.
        
        Returns:
            Dict with batch results
        """
        results = {
            'total': len(document_ids),
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'results': []
        }
        
        for doc_id in document_ids:
            result = self.index_document(doc_id, force_reindex=force_reindex)
            results['results'].append(result)
            
            if result.get('success'):
                if result.get('skipped'):
                    results['skipped'] += 1
                else:
                    results['successful'] += 1
            else:
                results['failed'] += 1
        
        return results

