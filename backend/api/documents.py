"""FastAPI endpoints for document retrieval."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from database import get_db
from models import Document, Matter

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
async def get_documents(
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    document_type: Optional[str] = Query(None, description="Filter by document type"),
    status: Optional[str] = Query(None, description="Filter by processing status"),
    limit: int = Query(100, description="Maximum number of documents to return"),
    offset: int = Query(0, description="Number of documents to skip"),
    db: Session = Depends(get_db)
):
    """
    Get list of documents with optional filters.
    
    Returns documents sorted by most recently ingested first.
    """
    query = db.query(Document)
    
    # Apply filters
    if matter_id:
        query = query.filter(Document.matter_id == matter_id)
    
    if document_type:
        query = query.filter(Document.document_type == document_type)
    
    if status:
        query = query.filter(Document.processing_status == status)
    
    # Only return current versions
    query = query.filter(Document.is_current_version == True)
    
    # Get total count
    total = query.count()
    
    # Apply pagination and ordering
    documents = query.order_by(Document.ingested_at.desc()).offset(offset).limit(limit).all()
    
    # Format response
    result = [
        {
            'id': str(doc.id),
            'filename': doc.file_name,
            'file_name': doc.file_name,
            'document_type': doc.document_type,
            'title': doc.title,
            'file_size': doc.file_size,
            'mime_type': doc.mime_type,
            'processing_status': doc.processing_status,
            'created_at': doc.created_at.isoformat() if doc.created_at else None,
            'ingested_at': doc.ingested_at.isoformat() if doc.ingested_at else None,
            'tags': doc.tags or [],
            'categories': doc.categories or [],
        }
        for doc in documents
    ]
    
    return {
        'total': total,
        'limit': limit,
        'offset': offset,
        'documents': result
    }


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a single document by ID.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    
    return {
        'id': str(document.id),
        'matter_id': str(document.matter_id),
        'filename': document.file_name,
        'file_name': document.file_name,
        'document_type': document.document_type,
        'title': document.title,
        'file_size': document.file_size,
        'mime_type': document.mime_type,
        'processing_status': document.processing_status,
        'created_at': document.created_at.isoformat() if document.created_at else None,
        'ingested_at': document.ingested_at.isoformat() if document.ingested_at else None,
        'tags': document.tags or [],
        'categories': document.categories or [],
        'text_length': document.text_length,
        'is_current_version': document.is_current_version,
        'version_number': document.version_number,
    }

