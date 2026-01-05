"""FastAPI endpoints for embedding and indexing operations."""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID

from database import get_db
from models import Document
from services.indexing import IndexingService
from services.reindexing import ReindexingService
from services.embedding import EmbeddingService
from services.qdrant_client import QdrantService
from services.chunking import ChunkingService

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


@router.post("/index/{document_id}")
async def index_document(
    document_id: str,
    force_reindex: bool = Query(False, description="Force reindex even if already indexed"),
    background: bool = Query(False, description="Run indexing in background"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Index a document: chunk, embed, and store in Qdrant."""
    # Verify document exists
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    indexing_service = IndexingService(db)
    
    if background:
        # Run in background
        background_tasks.add_task(
            indexing_service.index_document,
            document_id,
            force_reindex
        )
        return {
            'message': 'Indexing started in background',
            'document_id': document_id
        }
    else:
        # Run synchronously
        result = indexing_service.index_document(document_id, force_reindex=force_reindex)
        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('error', 'Indexing failed'))
        return result


@router.post("/index/batch")
async def index_batch(
    document_ids: List[str],
    force_reindex: bool = Query(False, description="Force reindex even if already indexed"),
    background: bool = Query(False, description="Run indexing in background"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Index multiple documents in batch."""
    indexing_service = IndexingService(db)
    
    if background:
        background_tasks.add_task(
            indexing_service.index_batch,
            document_ids,
            force_reindex
        )
        return {
            'message': 'Batch indexing started in background',
            'total_documents': len(document_ids)
        }
    else:
        result = indexing_service.index_batch(document_ids, force_reindex=force_reindex)
        return result


@router.delete("/index/{document_id}")
async def delete_document_index(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Delete all embeddings for a document."""
    indexing_service = IndexingService(db)
    result = indexing_service.delete_document_index(document_id)
    
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Deletion failed'))
    
    return result


@router.post("/reindex/model")
async def reindex_by_model(
    old_model: str = Query(..., description="Old embedding model name"),
    new_model: Optional[str] = Query(None, description="New embedding model (uses config if not provided)"),
    db: Session = Depends(get_db)
):
    """Reindex all documents indexed with a specific model."""
    reindexing_service = ReindexingService(db)
    result = reindexing_service.reindex_by_model(old_model, new_model)
    return result


@router.post("/reindex/matter/{matter_id}")
async def reindex_by_matter(
    matter_id: str,
    force_reindex: bool = Query(True, description="Force reindex even if already indexed"),
    db: Session = Depends(get_db)
):
    """Reindex all documents in a matter."""
    reindexing_service = ReindexingService(db)
    result = reindexing_service.reindex_by_matter(matter_id, force_reindex)
    return result


@router.post("/reindex/type/{document_type}")
async def reindex_by_type(
    document_type: str,
    force_reindex: bool = Query(True, description="Force reindex even if already indexed"),
    db: Session = Depends(get_db)
):
    """Reindex all documents of a specific type."""
    reindexing_service = ReindexingService(db)
    result = reindexing_service.reindex_by_document_type(document_type, force_reindex)
    return result


@router.post("/reindex/version-update")
async def handle_version_update(
    old_document_id: str,
    new_document_id: str,
    db: Session = Depends(get_db)
):
    """Handle embedding updates when a document version changes."""
    reindexing_service = ReindexingService(db)
    result = reindexing_service.handle_version_update(old_document_id, new_document_id)
    return result


@router.post("/cleanup/orphaned")
async def cleanup_orphaned_embeddings(
    db: Session = Depends(get_db)
):
    """Clean up embeddings for documents that no longer exist."""
    reindexing_service = ReindexingService(db)
    result = reindexing_service.cleanup_orphaned_embeddings()
    return result


@router.get("/statistics")
async def get_indexing_statistics(
    db: Session = Depends(get_db)
):
    """Get statistics about indexing."""
    reindexing_service = ReindexingService(db)
    stats = reindexing_service.get_indexing_statistics()
    return stats


@router.get("/collections")
async def list_collections():
    """List all Qdrant collections."""
    qdrant_service = QdrantService()
    try:
        collections = qdrant_service.client.get_collections()
        collection_info = []
        for col in collections.collections:
            info = qdrant_service.get_collection_info(col.name)
            if info:
                collection_info.append(info)
        return {
            'collections': collection_info,
            'total': len(collection_info)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing collections: {str(e)}")


@router.get("/collections/{collection_name}")
async def get_collection_info(collection_name: str):
    """Get information about a specific collection."""
    qdrant_service = QdrantService()
    info = qdrant_service.get_collection_info(collection_name)
    
    if not info:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    return info


@router.post("/search")
async def search_embeddings(
    query_text: str = Query(..., description="Search query text"),
    limit: int = Query(10, description="Number of results to return"),
    score_threshold: Optional[float] = Query(None, description="Minimum similarity score"),
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    document_type: Optional[str] = Query(None, description="Filter by document type"),
    db: Session = Depends(get_db)
):
    """Search documents using semantic similarity."""
    embedding_service = EmbeddingService()
    qdrant_service = QdrantService()
    
    if not embedding_service.is_available():
        raise HTTPException(status_code=503, detail="Embedding service not available")
    
    # Generate query embedding
    query_embedding = embedding_service.generate_embedding(query_text)
    if not query_embedding:
        raise HTTPException(status_code=500, detail="Failed to generate query embedding")
    
    # Build filter
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    
    filter_conditions = []
    if matter_id:
        filter_conditions.append(
            FieldCondition(key="matter_id", match=MatchValue(value=matter_id))
        )
    if document_type:
        filter_conditions.append(
            FieldCondition(key="document_type", match=MatchValue(value=document_type))
        )
    
    filter_condition = Filter(must=filter_conditions) if filter_conditions else None
    
    # Get collection name
    from services.indexing import IndexingService
    indexing_service = IndexingService(db)
    collection_name = indexing_service.collection_name
    
    # Search
    results = qdrant_service.search(
        collection_name=collection_name,
        query_vector=query_embedding,
        limit=limit,
        score_threshold=score_threshold,
        filter_condition=filter_condition
    )
    
    return {
        'query': query_text,
        'results_count': len(results),
        'results': results
    }


@router.get("/chunking/preview")
async def preview_chunking(
    text: str = Query(..., description="Text to preview chunking"),
    strategy: str = Query("sentence", description="Chunking strategy"),
    chunk_size: int = Query(1000, description="Chunk size"),
    chunk_overlap: int = Query(200, description="Chunk overlap"),
    db: Session = Depends(get_db)
):
    """Preview how text would be chunked."""
    from config import settings
    
    chunking_service = ChunkingService(
        strategy=strategy,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        min_chunk_size=settings.min_chunk_size,
        max_chunk_size=settings.max_chunk_size,
        respect_sentence_boundaries=settings.respect_sentence_boundaries,
        respect_paragraph_boundaries=settings.respect_paragraph_boundaries
    )
    
    chunks = chunking_service.chunk_text(text)
    
    return {
        'strategy': strategy,
        'total_chunks': len(chunks),
        'chunks': [
            {
                'index': chunk.chunk_index,
                'text': chunk.text[:200] + '...' if len(chunk.text) > 200 else chunk.text,
                'length': len(chunk.text),
                'start_position': chunk.start_position,
                'end_position': chunk.end_position,
            }
            for chunk in chunks
        ]
    }

