"""FastAPI endpoints for document retrieval."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import Optional, List
from datetime import datetime
import uuid

from database import get_db
from models import Document, Matter, DocumentEntity, Entity, EntityType, Fact
from config import settings

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
        try:
            matter_uuid = uuid.UUID(matter_id)
            query = query.filter(Document.matter_id == matter_uuid)
        except ValueError:
            # If not a valid UUID, skip the filter
            pass
    
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
    Returns facts with event dates and tags from the database.
    """
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    
    # Get facts from database
    facts = db.query(Fact).filter(Fact.document_id == doc_uuid).all()
    
    # Format facts for response - filter out facts with empty or None fact_text
    formatted_facts = []
    for fact in facts:
        # Skip facts with empty or None fact_text
        if not fact.fact_text or not fact.fact_text.strip():
            continue
        formatted_facts.append({
            'id': str(fact.id),
            'fact': fact.fact_text.strip(),
            'event_date': fact.event_date.isoformat() if fact.event_date else None,
            'tags': fact.tags or [],
            'confidence': float(fact.confidence_score) if fact.confidence_score else 0.7,
            'source_text': fact.source_text or '',
            'page_number': fact.page_number,
            'review_status': fact.review_status
        })
    
    # If no facts in database, try to extract and save them
    if not formatted_facts and document.extracted_text:
        try:
            from services.fact_extraction import FactExtractionService
            fact_service = FactExtractionService(db)
            extracted_facts = fact_service.extract_facts_from_document(str(doc_uuid), use_llm=fact_service.llm_client is not None)
            
            # Save extracted facts - only save facts with non-empty fact text
            for fact_data in extracted_facts:
                fact_text = fact_data.get('fact', '').strip() if fact_data.get('fact') else ''
                # Skip facts with empty fact text
                if not fact_text:
                    continue
                
                # Extract issues from tags
                issues = []
                tags = fact_data.get('tags', [])
                issue_tags = ['legal_proceeding', 'deadline', 'contract', 'evidence', 'witness', 'expert']
                for tag in tags:
                    if tag in issue_tags:
                        issues.append(tag.replace('_', ' ').title())
                
                # Parse event date
                event_date = None
                if fact_data.get('event_date'):
                    try:
                        from datetime import date as date_type
                        event_date = date_type.fromisoformat(fact_data['event_date'])
                    except:
                        pass
                
                fact = Fact(
                    document_id=doc_uuid,
                    matter_id=document.matter_id,
                    fact_text=fact_text,
                    source_text=fact_data.get('source_text'),
                    page_number=fact_data.get('page_number'),
                    event_date=event_date,
                    tags=tags,
                    issues=issues,
                    confidence_score=fact_data.get('confidence', 0.7),
                    review_status='not_reviewed',
                    extraction_method='llm' if fact_service.llm_client else 'pattern',
                    extraction_model=settings.rag_model if fact_service.llm_client else None
                )
                db.add(fact)
            
            db.commit()
            
            # Re-query facts
            facts = db.query(Fact).filter(Fact.document_id == doc_uuid).all()
            formatted_facts = []
            for fact in facts:
                # Skip facts with empty or None fact_text
                if not fact.fact_text or not fact.fact_text.strip():
                    continue
                formatted_facts.append({
                    'id': str(fact.id),
                    'fact': fact.fact_text.strip(),
                    'event_date': fact.event_date.isoformat() if fact.event_date else None,
                    'tags': fact.tags or [],
                    'confidence': float(fact.confidence_score) if fact.confidence_score else 0.7,
                    'source_text': fact.source_text or '',
                    'page_number': fact.page_number,
                    'review_status': fact.review_status
                })
        except Exception as e:
            import traceback
            print(f"Error extracting facts: {str(e)}")
            traceback.print_exc()
    
    # Ensure we always return a list (even if empty) with proper structure
    return formatted_facts


@router.post("/{document_id}/review/facts/extract")
async def extract_facts_manually(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Manually trigger fact extraction for a document.
    Returns the extracted facts.
    """
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    
    if not document.extracted_text:
        raise HTTPException(
            status_code=400, 
            detail="Document text has not been extracted yet. Please wait for document processing to complete."
        )
    
    try:
        from services.fact_extraction import FactExtractionService
        fact_service = FactExtractionService(db)
        extracted_facts = fact_service.extract_facts_from_document(str(doc_uuid), use_llm=fact_service.llm_client is not None)
        
        if not extracted_facts:
            return {
                'facts': [],
                'message': 'No facts could be extracted from this document. The document may not contain extractable factual information.',
                'extracted_count': 0
            }
        
        # Delete existing facts for this document (optional - you might want to keep them)
        # db.query(Fact).filter(Fact.document_id == doc_uuid).delete()
        
        # Save extracted facts - only save facts with non-empty fact text
        saved_count = 0
        for fact_data in extracted_facts:
            fact_text = fact_data.get('fact', '').strip() if fact_data.get('fact') else ''
            # Skip facts with empty fact text
            if not fact_text:
                continue
            
            # Extract issues from tags
            issues = []
            tags = fact_data.get('tags', [])
            issue_tags = ['legal_proceeding', 'deadline', 'contract', 'evidence', 'witness', 'expert']
            for tag in tags:
                if tag in issue_tags:
                    issues.append(tag.replace('_', ' ').title())
            
            # Parse event date
            event_date = None
            if fact_data.get('event_date'):
                try:
                    from datetime import date as date_type
                    event_date = date_type.fromisoformat(fact_data['event_date'])
                except:
                    pass
            
            fact = Fact(
                document_id=doc_uuid,
                matter_id=document.matter_id,
                fact_text=fact_text,
                source_text=fact_data.get('source_text'),
                page_number=fact_data.get('page_number'),
                event_date=event_date,
                tags=tags,
                issues=issues,
                confidence_score=fact_data.get('confidence', 0.7),
                review_status='not_reviewed',
                extraction_method='llm' if fact_service.llm_client else 'pattern',
                extraction_model=settings.rag_model if fact_service.llm_client else None
            )
            db.add(fact)
            saved_count += 1
        
        db.commit()
        
        # Re-query facts
        facts = db.query(Fact).filter(Fact.document_id == doc_uuid).all()
        formatted_facts = []
        for fact in facts:
            # Skip facts with empty or None fact_text
            if not fact.fact_text or not fact.fact_text.strip():
                continue
            formatted_facts.append({
                'id': str(fact.id),
                'fact': fact.fact_text.strip(),
                'event_date': fact.event_date.isoformat() if fact.event_date else None,
                'tags': fact.tags or [],
                'confidence': float(fact.confidence_score) if fact.confidence_score else 0.7,
                'source_text': fact.source_text or '',
                'page_number': fact.page_number,
                'review_status': fact.review_status
            })
        
        return {
            'facts': formatted_facts,
            'extracted_count': saved_count,
            'message': f'Successfully extracted {saved_count} fact(s) from the document.'
        }
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"Error extracting facts: {error_msg}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract facts: {error_msg}"
        )


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
    
    # If no entities in database, extract from document text
    if not entities:
        # Try metadata first
        if document.metadata_json:
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
        
        # Extract entities from text using metadata extraction service
        if not entities and document.extracted_text:
            try:
                from services.metadata_extraction import MetadataExtractionService
                metadata_service = MetadataExtractionService()
                extracted_entities = metadata_service.extract_entities(document.extracted_text)
                
                # Count mentions for each entity
                entity_counts = {}
                for entity_data in extracted_entities:
                    entity_value = entity_data.get('value', '')
                    entity_type = entity_data.get('type', 'unknown')
                    key = f"{entity_type}:{entity_value.lower()}"
                    if key not in entity_counts:
                        entity_counts[key] = {
                            'value': entity_value,
                            'type': entity_type,
                            'count': 0,
                            'confidence': entity_data.get('confidence', 0.7)
                        }
                    entity_counts[key]['count'] += 1
                
                # Format entities
                for idx, (key, entity_info) in enumerate(entity_counts.items()):
                    entities.append({
                        'id': str(uuid.uuid4()),
                        'name': entity_info['value'],
                        'type': entity_info['type'],
                        'mentions': entity_info['count'],
                        'confidence': entity_info['confidence']
                    })
            except Exception as e:
                print(f"Error extracting entities from text: {str(e)}")
    
    return entities


@router.get("/matter/{matter_id}/entities")
async def get_matter_entities(
    matter_id: str,
    search: Optional[str] = Query(None, description="Search entities by name"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    review_status: Optional[str] = Query(None, description="Filter by review status: accepted, not_reviewed, rejected"),
    limit: int = Query(100, description="Maximum number of entities to return"),
    offset: int = Query(0, description="Number of entities to skip"),
    db: Session = Depends(get_db)
):
    """
    Get all entities for a matter with their details and fact counts.
    Returns entities with name, type, normalized name, short name, email, role, and related facts count.
    """
    try:
        matter_uuid = uuid.UUID(matter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid matter ID format: {matter_id}")
    
    # Get all documents for this matter
    documents = db.query(Document).filter(
        Document.matter_id == matter_uuid,
        Document.is_current_version == True
    ).all()
    
    doc_ids = [doc.id for doc in documents]
    
    if not doc_ids:
        return {
            'total': 0,
            'limit': limit,
            'offset': offset,
            'entities': []
        }
    
    # Get distinct entity IDs from document_entities
    entity_ids = db.query(DocumentEntity.entity_id).filter(
        DocumentEntity.document_id.in_(doc_ids)
    ).distinct().all()
    entity_id_list = [eid[0] for eid in entity_ids]
    
    if not entity_id_list:
        return {
            'total': 0,
            'limit': limit,
            'offset': offset,
            'entities': []
        }
    
    # Build query for entities
    query = db.query(Entity).join(
        EntityType, Entity.entity_type_id == EntityType.id
    ).filter(
        Entity.id.in_(entity_id_list)
    )
    
    # Apply search filter
    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                Entity.display_name.ilike(search_term),
                Entity.normalized_name.ilike(search_term)
            )
        )
    
    # Apply type filter
    if entity_type:
        query = query.filter(EntityType.type_name == entity_type)
    
    # Apply review status filter
    if review_status:
        query = query.filter(Entity.review_status == review_status)
    
    # Get all entities
    entity_results = query.all()
    
    # Build entity map with aggregated data
    entity_map = {}
    for entity in entity_results:
        entity_id = str(entity.id)
        if entity_id not in entity_map:
            # Get entity type
            entity_type_obj = db.query(EntityType).filter(
                EntityType.id == entity.entity_type_id
            ).first()
            # Get fact count for this entity
            # Count facts that mention this entity in their text
            entity_name = entity.display_name or entity.normalized_name
            fact_count = db.query(Fact).filter(
                and_(
                    Fact.matter_id == matter_uuid,
                    or_(
                        Fact.fact_text.ilike(f"%{entity_name}%"),
                        Fact.source_text.ilike(f"%{entity_name}%")
                    )
                )
            ).count()
            
            # Extract attributes
            attributes = entity.attributes or {}
            email = attributes.get('email', '')
            role = attributes.get('role', '')
            short_name = attributes.get('short_name', '') or attributes.get('shortName', '')
            
            entity_map[entity_id] = {
                'id': entity_id,
                'name': entity.display_name or entity.normalized_name,
                'type': entity_type_obj.type_name if entity_type_obj else 'unknown',
                '@name': entity.normalized_name,
                'short_name': short_name,
                'email': email,
                'role': role,
                'review_status': entity.review_status or 'not_reviewed',
                'related_facts_count': fact_count,
                'attributes': attributes
            }
    
    # Convert to list and sort
    entities_list = list(entity_map.values())
    
    # Sort by name
    entities_list.sort(key=lambda x: x['name'].lower())
    
    # Get total count
    total = len(entities_list)
    
    # Apply pagination
    paginated_entities = entities_list[offset:offset + limit]
    
    return {
        'total': total,
        'limit': limit,
        'offset': offset,
        'entities': paginated_entities
    }


@router.get("/matter/{matter_id}/facts")
async def get_matter_facts(
    matter_id: str,
    limit: int = Query(20, description="Number of facts per page"),
    offset: int = Query(0, description="Number of facts to skip"),
    review_status: Optional[str] = Query(None, description="Filter by review status: accepted, not_reviewed, rejected"),
    db: Session = Depends(get_db)
):
    """
    Get all facts for a matter with pagination from the database.
    Returns facts with date/time, fact text, issues, evidence, and review status.
    """
    try:
        matter_uuid = uuid.UUID(matter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid matter ID format: {matter_id}")
    
    # Query facts from database
    query = db.query(Fact).filter(Fact.matter_id == matter_uuid)
    
    # Filter by review status if provided
    if review_status:
        query = query.filter(Fact.review_status == review_status)
    
    # Get total count
    total = query.count()
    
    # Sort by date (most recent first, or by created_at if no date)
    query = query.order_by(
        Fact.event_date.desc().nullslast(),
        Fact.created_at.desc()
    )
    
    # Apply pagination
    facts = query.offset(offset).limit(limit).all()
    
    # Format response
    formatted_facts = []
    for fact in facts:
        document = db.query(Document).filter(Document.id == fact.document_id).first()
        evidence = document.file_name if document else "Unknown Document"
        
        formatted_facts.append({
            'id': str(fact.id),
            'date_time': fact.event_date.isoformat() if fact.event_date else None,
            'fact': fact.fact_text,
            'issues': fact.issues or [],
            'evidence': evidence,
            'review_status': fact.review_status,
            'confidence': float(fact.confidence_score) if fact.confidence_score else 0.7,
            'source_text': fact.source_text or '',
            'document_id': str(fact.document_id),
            'document_name': evidence
        })
    
    return {
        'total': total,
        'limit': limit,
        'offset': offset,
        'facts': formatted_facts
    }


@router.patch("/facts/{fact_id}/review-status")
async def update_fact_review_status(
    fact_id: str,
    review_status: str = Query(..., description="New review status: accepted, rejected, not_reviewed"),
    review_notes: Optional[str] = Query(None, description="Optional review notes"),
    db: Session = Depends(get_db)
):
    """
    Update the review status of a fact.
    """
    try:
        fact_uuid = uuid.UUID(fact_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid fact ID format: {fact_id}")
    
    if review_status not in ['accepted', 'rejected', 'not_reviewed']:
        raise HTTPException(status_code=400, detail=f"Invalid review status: {review_status}")
    
    fact = db.query(Fact).filter(Fact.id == fact_uuid).first()
    if not fact:
        raise HTTPException(status_code=404, detail=f"Fact {fact_id} not found")
    
    fact.review_status = review_status
    fact.reviewed_at = datetime.utcnow()
    if review_notes:
        fact.review_notes = review_notes
    
    db.commit()
    
    return {
        'id': str(fact.id),
        'review_status': fact.review_status,
        'reviewed_at': fact.reviewed_at.isoformat() if fact.reviewed_at else None
    }


@router.patch("/entities/{entity_id}/review-status")
async def update_entity_review_status(
    entity_id: str,
    review_status: str = Query(..., description="New review status: accepted, rejected, not_reviewed"),
    review_notes: Optional[str] = Query(None, description="Optional review notes"),
    db: Session = Depends(get_db)
):
    """
    Update the review status of an entity.
    """
    try:
        entity_uuid = uuid.UUID(entity_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid entity ID format: {entity_id}")
    
    if review_status not in ['accepted', 'rejected', 'not_reviewed']:
        raise HTTPException(status_code=400, detail=f"Invalid review status: {review_status}")
    
    entity = db.query(Entity).filter(Entity.id == entity_uuid).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
    
    entity.review_status = review_status
    entity.reviewed_at = datetime.utcnow()
    if review_notes:
        entity.review_notes = review_notes
    
    db.commit()
    
    return {
        'id': str(entity.id),
        'review_status': entity.review_status,
        'reviewed_at': entity.reviewed_at.isoformat() if entity.reviewed_at else None
    }


@router.delete("/facts/{fact_id}")
async def delete_fact(
    fact_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a fact permanently.
    """
    try:
        fact_uuid = uuid.UUID(fact_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid fact ID format: {fact_id}")
    
    fact = db.query(Fact).filter(Fact.id == fact_uuid).first()
    if not fact:
        raise HTTPException(status_code=404, detail=f"Fact {fact_id} not found")
    
    db.delete(fact)
    db.commit()
    
    return {
        'id': str(fact_uuid),
        'deleted': True
    }


@router.get("/matter/{matter_id}/facts-per-entity")
async def get_facts_per_entity(
    matter_id: str,
    db: Session = Depends(get_db)
):
    """
    Get aggregated facts and entities for a matter.
    Returns entity names with fact counts for the pie chart.
    """
    try:
        matter_uuid = uuid.UUID(matter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid matter ID format: {matter_id}")
    
    # Get all documents for this matter
    documents = db.query(Document).filter(
        Document.matter_id == matter_uuid,
        Document.is_current_version == True
    ).all()
    
    # Aggregate entities and their fact counts
    entity_fact_counts = {}
    all_entities = {}
    
    for document in documents:
        if not document.extracted_text:
            continue
        
        # Get entities for this document
        try:
            from services.metadata_extraction import MetadataExtractionService
            metadata_service = MetadataExtractionService()
            entities = metadata_service.extract_entities(document.extracted_text)
            
            for entity in entities:
                entity_name = entity.get('value', '').strip()
                entity_type = entity.get('type', 'unknown')
                
                if not entity_name or len(entity_name) < 2:
                    continue
                
                # Normalize entity name (use display name as key)
                key = entity_name.lower()
                if key not in all_entities:
                    all_entities[key] = {
                        'name': entity_name,
                        'type': entity_type,
                        'fact_count': 0
                    }
        except Exception as e:
            print(f"Error extracting entities: {str(e)}")
        
        # Get facts for this document
        try:
            from services.fact_extraction import FactExtractionService
            fact_service = FactExtractionService(db)
            facts = fact_service.extract_facts_from_document(str(document.id), use_llm=False)
            
            # Count facts mentioning each entity
            for fact in facts:
                fact_text = fact.get('fact', '').lower()
                source_text = fact.get('source_text', '').lower()
                
                for key, entity_info in all_entities.items():
                    entity_name_lower = entity_info['name'].lower()
                    # Check if entity is mentioned in fact
                    if entity_name_lower in fact_text or entity_name_lower in source_text:
                        entity_fact_counts[key] = entity_fact_counts.get(key, 0) + 1
        except Exception as e:
            print(f"Error extracting facts: {str(e)}")
    
    # Format response for pie chart
    # Sort by fact count and take top entities
    sorted_entities = sorted(
        all_entities.items(),
        key=lambda x: entity_fact_counts.get(x[0], 0),
        reverse=True
    )[:10]  # Top 10 entities
    
    # Generate colors for pie chart
    colors = [
        '#8b5cf6', '#e5e7eb', '#1e40af', '#a78bfa', '#3b82f6',
        '#60a5fa', '#93c5fd', '#cbd5e1', '#d1d5db', '#9ca3af'
    ]
    
    result = []
    for idx, (key, entity_info) in enumerate(sorted_entities):
        fact_count = entity_fact_counts.get(key, 0)
        if fact_count > 0:  # Only include entities with facts
            result.append({
                'name': entity_info['name'],
                'value': fact_count,
                'color': colors[idx % len(colors)],
                'type': entity_info['type']
            })
    
    return result


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
    
    summary_text = ""
    key_points = []
    topics = []
    
    if document.extracted_text:
        text = document.extracted_text
        
        # Generate a better summary by extracting key sentences
        # Split into sentences
        import re
        sentences = re.split(r'[.!?]+\s+', text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
        
        # Take first few sentences and a few from middle/end for better summary
        if len(sentences) > 0:
            summary_sentences = []
            # First sentence (usually introduction)
            if len(sentences) > 0:
                summary_sentences.append(sentences[0])
            # Middle sentence if document is long
            if len(sentences) > 3:
                mid_point = len(sentences) // 2
                summary_sentences.append(sentences[mid_point])
            # Last sentence (usually conclusion)
            if len(sentences) > 1:
                summary_sentences.append(sentences[-1])
            
            summary_text = ". ".join(summary_sentences[:3])
            if len(summary_text) > 1000:
                summary_text = summary_text[:997] + "..."
        else:
            # Fallback: first 500 characters
            summary_text = text[:500] + ("..." if len(text) > 500 else "")
        
        # Extract key points from document
        key_points = []
        
        # Extract dates mentioned
        date_pattern = r'\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})\b'
        dates = re.findall(date_pattern, text)
        if dates:
            key_points.append(f"Contains {len(set(dates))} unique date reference(s)")
        
        # Extract entities
        try:
            from services.metadata_extraction import MetadataExtractionService
            metadata_service = MetadataExtractionService()
            extracted_entities = metadata_service.extract_entities(text)
            
            entity_types = {}
            for entity in extracted_entities:
                entity_type = entity.get('type', 'unknown')
                entity_types[entity_type] = entity_types.get(entity_type, 0) + 1
            
            if entity_types:
                entity_summary = ", ".join([f"{count} {etype}" for etype, count in list(entity_types.items())[:3]])
                key_points.append(f"References: {entity_summary}")
        except Exception:
            pass
        
        # Extract key legal terms
        legal_keywords = ['hearing', 'trial', 'motion', 'filing', 'deposition', 'discovery', 'settlement', 
                         'judgment', 'order', 'complaint', 'defendant', 'plaintiff', 'witness', 'evidence']
        found_keywords = [kw for kw in legal_keywords if kw.lower() in text.lower()]
        if found_keywords:
            key_points.append(f"Contains legal terms: {', '.join(found_keywords[:5])}")
        
        # Extract topics from categories if available
        if document.categories:
            topics = document.categories[:5]
        elif document.tags:
            topics = document.tags[:5]
        else:
            # Infer topics from content
            if any(kw in text.lower() for kw in ['medical', 'health', 'treatment', 'diagnosis']):
                topics.append('medical')
            if any(kw in text.lower() for kw in ['financial', 'payment', 'cost', 'expense']):
                topics.append('financial')
            if any(kw in text.lower() for kw in ['contract', 'agreement', 'terms']):
                topics.append('contract')
            if any(kw in text.lower() for kw in ['legal', 'court', 'lawsuit', 'case']):
                topics.append('legal')
    
    # If no summary can be generated, return placeholder
    if not summary_text:
        summary_text = "Summary generation is in progress. Please check back later."
        key_points = ["Document is being processed"]
    
    return {
        'summary': summary_text,
        'key_points': key_points,
        'topics': topics
    }

