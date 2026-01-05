"""FastAPI endpoints for document retrieval."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
import uuid

from database import get_db
from models import Document, Matter, DocumentEntity, Entity, EntityType

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
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    
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


@router.get("/{document_id}/review/facts")
async def get_suggested_facts(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Get suggested facts extracted from the document by Document Intelligence engine.
    Returns facts with event dates and tags.
    """
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    
    # Use fact extraction service
    from services.fact_extraction import FactExtractionService
    
    fact_service = FactExtractionService(db)
    # Try LLM first if available, otherwise use pattern-based extraction (no OpenAI required)
    facts = fact_service.extract_facts_from_document(str(doc_uuid), use_llm=fact_service.llm_client is not None)
    
    # If no facts extracted, try fallback to metadata
    if not facts and document.metadata_json:
        extracted_metadata = document.metadata_json.get('extracted_metadata', {})
        dates = extracted_metadata.get('dates', [])
        
        # Generate basic facts from metadata
        fact_id = 1
        for date_str in dates[:3]:  # Limit to 3 date-based facts
            facts.append({
                'id': str(fact_id),
                'fact': f"Document references date: {date_str}",
                'event_date': date_str if date_str else None,
                'tags': ['general'],
                'confidence': 0.7,
                'source_text': f"Date mentioned: {date_str}",
                'page_number': None
            })
            fact_id += 1
    
    return facts


@router.get("/{document_id}/review/entities")
async def get_document_entities(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Get entities (persons, businesses, etc.) related to this document.
    """
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    
    # Get entities linked to this document
    document_entities = db.query(DocumentEntity).filter(
        DocumentEntity.document_id == doc_uuid
    ).all()
    
    # Format entities with their details
    entities = []
    for doc_entity in document_entities:
        try:
            entity = db.query(Entity).filter(Entity.id == doc_entity.entity_id).first()
            if entity:
                entity_type = db.query(EntityType).filter(EntityType.id == entity.entity_type_id).first()
                entities.append({
                    'id': str(entity.id),
                    'name': entity.display_name or entity.normalized_name,
                    'type': entity_type.type_name if entity_type else 'unknown',
                    'mentions': doc_entity.mention_count or 1,
                    'confidence': float(doc_entity.confidence_score) if doc_entity.confidence_score else 0.8
                })
        except Exception:
            continue
    
    # If no entities in database, try to extract from metadata
    if not entities and document.metadata_json:
        extracted_metadata = document.metadata_json.get('extracted_metadata', {})
        email_entities = extracted_metadata.get('entities', [])
        
        for entity_data in email_entities:
            if entity_data.get('type') == 'email':
                entities.append({
                    'id': str(uuid.uuid4()),
                    'name': entity_data.get('value', ''),
                    'type': 'email_address',
                    'mentions': 1,
                    'confidence': 0.7
                })
    
    return entities


@router.get("/{document_id}/review/summary")
async def get_document_summary(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Get automatic summarization of the document with links to key information.
    """
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    
    # TODO: Implement actual summarization using AI/LLM
    # For now, generate a basic summary from extracted text
    
    summary_text = ""
    key_points = []
    topics = []
    
    if document.extracted_text:
        # Basic summary: first 500 characters
        text = document.extracted_text
        if len(text) > 500:
            summary_text = text[:500] + "..."
        else:
            summary_text = text
        
        # Extract key points (stub - would use NLP in production)
        if document.metadata_json:
            extracted_metadata = document.metadata_json.get('extracted_metadata', {})
            dates = extracted_metadata.get('dates', [])
            entities = extracted_metadata.get('entities', [])
            
            if dates:
                key_points.append(f"Document contains {len(dates)} date reference(s)")
            if entities:
                key_points.append(f"Document references {len(entities)} entity/entities")
            
            # Extract topics from categories if available
            if document.categories:
                topics = document.categories[:5]  # Limit to 5 topics
    
    # If no summary can be generated, return placeholder
    if not summary_text:
        summary_text = "Summary generation is in progress. Please check back later."
        key_points = ["Document is being processed"]
    
    return {
        'summary': summary_text,
        'key_points': key_points,
        'topics': topics
    }

