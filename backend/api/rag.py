"""FastAPI endpoints for RAG, timeline, and link analysis."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from database import get_db
from services.rag import RAGService
from services.timeline import TimelineService
from services.link_analysis import LinkAnalysisService
from services.event_extraction import EventExtractionService

router = APIRouter(prefix="/api/rag", tags=["rag"])


@router.post("/query")
async def rag_query(
    question: str = Query(..., description="Question to answer"),
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    document_ids: Optional[List[str]] = Query(None, description="Filter by document IDs"),
    top_k: Optional[int] = Query(None, description="Number of chunks to retrieve"),
    score_threshold: Optional[float] = Query(None, description="Minimum similarity score"),
    include_citations: bool = Query(True, description="Include citations in response"),
    db: Session = Depends(get_db)
):
    """Perform RAG query with citations."""
    rag_service = RAGService(db)
    result = rag_service.query(
        question=question,
        matter_id=matter_id,
        document_ids=document_ids,
        top_k=top_k,
        score_threshold=score_threshold,
        include_citations=include_citations
    )
    
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'RAG query failed'))
    
    return result


@router.post("/extract-events/{document_id}")
async def extract_events(
    document_id: str,
    use_llm: bool = Query(True, description="Use LLM for extraction"),
    save: bool = Query(True, description="Save events to database"),
    db: Session = Depends(get_db)
):
    """Extract events from a document."""
    event_service = EventExtractionService(db)
    
    events = event_service.extract_events_from_document(document_id, use_llm=use_llm)
    
    if save and events:
        saved = event_service.save_events(events, document_id)
        return {
            'success': True,
            'extracted_count': len(events),
            'saved_count': len(saved),
            'events': [event_service._format_event_for_response(e) for e in saved]
        }
    
    return {
        'success': True,
        'extracted_count': len(events),
        'saved_count': 0,
        'events': events
    }


@router.get("/timeline")
async def get_timeline(
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    start_date: Optional[date] = Query(None, description="Start date"),
    end_date: Optional[date] = Query(None, description="End date"),
    event_types: Optional[List[str]] = Query(None, description="Filter by event types"),
    participant_entity_ids: Optional[List[str]] = Query(None, description="Filter by participant entities"),
    location_text: Optional[str] = Query(None, description="Filter by location"),
    limit: Optional[int] = Query(None, description="Maximum number of events"),
    db: Session = Depends(get_db)
):
    """Get chronological timeline of events."""
    timeline_service = TimelineService(db)
    timeline = timeline_service.get_timeline(
        matter_id=matter_id,
        start_date=start_date,
        end_date=end_date,
        event_types=event_types,
        participant_entity_ids=participant_entity_ids,
        location_text=location_text,
        limit=limit
    )
    
    return {
        'timeline': timeline,
        'count': len(timeline)
    }


@router.get("/timeline/document/{document_id}")
async def get_document_timeline(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get timeline of events from a specific document."""
    timeline_service = TimelineService(db)
    timeline = timeline_service.get_timeline_by_document(document_id)
    
    return {
        'document_id': document_id,
        'timeline': timeline,
        'count': len(timeline)
    }


@router.get("/timeline/summary")
async def get_timeline_summary(
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    start_date: Optional[date] = Query(None, description="Start date"),
    end_date: Optional[date] = Query(None, description="End date"),
    db: Session = Depends(get_db)
):
    """Get timeline summary statistics."""
    timeline_service = TimelineService(db)
    summary = timeline_service.get_timeline_summary(
        matter_id=matter_id,
        start_date=start_date,
        end_date=end_date
    )
    
    return summary


@router.get("/timeline/upcoming")
async def get_upcoming_events(
    days_ahead: int = Query(30, description="Days ahead to look"),
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    db: Session = Depends(get_db)
):
    """Get upcoming events."""
    timeline_service = TimelineService(db)
    events = timeline_service.get_upcoming_events(days_ahead=days_ahead, matter_id=matter_id)
    
    return {
        'upcoming_events': events,
        'count': len(events),
        'days_ahead': days_ahead
    }


@router.get("/links/entity/{entity_id}")
async def get_entity_connections(
    entity_id: str,
    max_depth: int = Query(2, description="Maximum relationship depth"),
    relationship_types: Optional[List[str]] = Query(None, description="Filter by relationship types"),
    db: Session = Depends(get_db)
):
    """Find all entities connected to a given entity."""
    link_service = LinkAnalysisService(db)
    graph = link_service.find_entity_connections(
        entity_id=entity_id,
        max_depth=max_depth,
        relationship_types=relationship_types
    )
    
    return graph


@router.get("/links/document/{document_id}")
async def get_document_connections(
    document_id: str,
    via_entities: bool = Query(True, description="Find connections via shared entities"),
    via_events: bool = Query(True, description="Find connections via shared events"),
    db: Session = Depends(get_db)
):
    """Find documents connected to a given document."""
    link_service = LinkAnalysisService(db)
    connections = link_service.find_document_connections(
        document_id=document_id,
        via_entities=via_entities,
        via_events=via_events
    )
    
    return connections


@router.get("/links/event/{event_id}")
async def get_event_connections(
    event_id: str,
    via_participants: bool = Query(True, description="Find via shared participants"),
    via_temporal_proximity: bool = Query(True, description="Find via temporal proximity"),
    days_threshold: int = Query(30, description="Days for temporal proximity"),
    db: Session = Depends(get_db)
):
    """Find events connected to a given event."""
    link_service = LinkAnalysisService(db)
    connections = link_service.find_event_connections(
        event_id=event_id,
        via_participants=via_participants,
        via_temporal_proximity=via_temporal_proximity,
        days_threshold=days_threshold
    )
    
    return connections


@router.get("/links/matter/{matter_id}/network")
async def analyze_matter_network(
    matter_id: str,
    db: Session = Depends(get_db)
):
    """Analyze the complete network for a matter."""
    link_service = LinkAnalysisService(db)
    network = link_service.analyze_matter_network(matter_id)
    
    return network

