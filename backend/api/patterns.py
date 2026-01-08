"""FastAPI endpoints for pattern detection and AI knowledge base features."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from database import get_db
from services.pattern_detection import PatternDetectionService
from services.document_organization import DocumentOrganizationService
from services.rag import RAGService
from services.timeline import TimelineService

router = APIRouter(prefix="/api/patterns", tags=["patterns"])


@router.get("/detect/rico")
async def detect_rico_patterns(
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    entity_ids: Optional[List[str]] = Query(None, description="Filter by entity IDs"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    document_types: Optional[List[str]] = Query(None, description="Filter by document types"),
    min_confidence: Optional[float] = Query(None, description="Minimum confidence score (0.0-1.0)"),
    db: Session = Depends(get_db)
):
    """
    Detect RICO-related patterns across documents.
    
    Returns:
        Dict with detected patterns including:
        - recurring_actors
        - timing_sequences
        - coordinated_actions
        - financial_patterns
        - communication_patterns
    """
    try:
        service = PatternDetectionService(db)
        
        # Parse dates
        start_dt = None
        end_dt = None
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid start_date format: {start_date}. Use YYYY-MM-DD")
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid end_date format: {end_date}. Use YYYY-MM-DD")
        
        patterns = service.detect_rico_patterns(
            matter_id=matter_id,
            entity_ids=entity_ids,
            start_date=start_dt,
            end_date=end_dt,
            document_types=document_types,
            min_confidence=min_confidence
        )
        return patterns
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error detecting patterns: {str(e)}")


@router.get("/detect/inconsistencies")
async def detect_inconsistencies(
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    document_types: Optional[List[str]] = Query(None, description="Filter by document types"),
    db: Session = Depends(get_db)
):
    """
    Detect inconsistencies across documents.
    
    Returns:
        List of detected inconsistencies
    """
    try:
        service = PatternDetectionService(db)
        
        # Parse dates
        start_dt = None
        end_dt = None
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid start_date format: {start_date}")
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid end_date format: {end_date}")
        
        inconsistencies = service.detect_inconsistencies(
            matter_id=matter_id,
            start_date=start_dt,
            end_date=end_dt,
            document_types=document_types
        )
        return {
            'inconsistencies': inconsistencies,
            'count': len(inconsistencies)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error detecting inconsistencies: {str(e)}")


@router.get("/suggest")
async def suggest_patterns(
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    use_ai: bool = Query(True, description="Use AI for suggestions"),
    db: Session = Depends(get_db)
):
    """
    Get AI-suggested patterns and relationships.
    
    Returns:
        List of suggested patterns
    """
    try:
        service = PatternDetectionService(db)
        suggestions = service.suggest_patterns(
            matter_id=matter_id,
            use_ai=use_ai
        )
        return {
            'suggestions': suggestions,
            'count': len(suggestions)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating suggestions: {str(e)}")


@router.get("/matter/{matter_id}/summary")
async def get_matter_pattern_summary(
    matter_id: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    document_types: Optional[List[str]] = Query(None, description="Filter by document types"),
    min_confidence: Optional[float] = Query(None, description="Minimum confidence score"),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive pattern summary for a matter.
    
    Returns:
        Dict with all detected patterns, inconsistencies, and suggestions
    """
    try:
        service = PatternDetectionService(db)
        
        # Parse dates
        start_dt = None
        end_dt = None
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid start_date format: {start_date}")
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid end_date format: {end_date}")
        
        # Get all patterns with filters
        rico_patterns = service.detect_rico_patterns(
            matter_id=matter_id,
            start_date=start_dt,
            end_date=end_dt,
            document_types=document_types,
            min_confidence=min_confidence
        )
        inconsistencies = service.detect_inconsistencies(
            matter_id=matter_id,
            start_date=start_dt,
            end_date=end_dt,
            document_types=document_types
        )
        suggestions = service.suggest_patterns(matter_id=matter_id, use_ai=True)
        
        return {
            'matter_id': matter_id,
            'rico_patterns': rico_patterns,
            'inconsistencies': inconsistencies,
            'suggestions': suggestions,
            'summary': {
                'total_patterns': (
                    len(rico_patterns.get('recurring_actors', [])) +
                    len(rico_patterns.get('timing_sequences', [])) +
                    len(rico_patterns.get('coordinated_actions', [])) +
                    len(rico_patterns.get('financial_patterns', [])) +
                    len(rico_patterns.get('communication_patterns', []))
                ),
                'total_inconsistencies': len(inconsistencies),
                'total_suggestions': len(suggestions),
                'overall_confidence': rico_patterns.get('overall_confidence', 0.0)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")


@router.get("/documents/{document_id}/classify")
async def classify_document(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Classify and organize a document.
    
    Returns:
        Dict with classification results
    """
    try:
        from models import Document
        import uuid
        
        doc_uuid = uuid.UUID(document_id)
        document = db.query(Document).filter(Document.id == doc_uuid).first()
        
        if not document:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        
        service = DocumentOrganizationService(db)
        classification = service.classify_document(document)
        
        return classification
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error classifying document: {str(e)}")


@router.get("/matter/{matter_id}/group-by-issue")
async def group_documents_by_issue(
    matter_id: str,
    db: Session = Depends(get_db)
):
    """
    Group documents by issue/topic.
    
    Returns:
        Dict mapping issue names to lists of documents
    """
    try:
        service = DocumentOrganizationService(db)
        groups = service.group_documents_by_issue(matter_id)
        
        return {
            'matter_id': matter_id,
            'groups': groups,
            'group_count': len(groups)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error grouping documents: {str(e)}")


@router.post("/documents/{document_id}/apply-naming")
async def apply_naming_convention(
    document_id: str,
    convention: str = Query('standard', description="Naming convention: standard, simple, descriptive"),
    db: Session = Depends(get_db)
):
    """
    Apply naming convention to a document.
    
    Returns:
        Dict with suggested name
    """
    try:
        from models import Document
        import uuid
        
        doc_uuid = uuid.UUID(document_id)
        document = db.query(Document).filter(Document.id == doc_uuid).first()
        
        if not document:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        
        service = DocumentOrganizationService(db)
        suggested_name = service.apply_naming_convention(document, convention)
        
        return {
            'document_id': document_id,
            'original_name': document.file_name,
            'suggested_name': suggested_name,
            'convention': convention
        }
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {document_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error applying naming convention: {str(e)}")


@router.post("/rag/query-enhanced")
async def rag_query_enhanced(
    question: str = Query(..., description="Question to answer"),
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    include_patterns: bool = Query(True, description="Include pattern context in answer"),
    db: Session = Depends(get_db)
):
    """
    Enhanced RAG query with pattern awareness.
    
    Returns:
        Dict with answer, citations, and relevant patterns
    """
    try:
        rag_service = RAGService(db)
        
        # Get answer
        result = rag_service.query(
            question=question,
            matter_id=matter_id,
            include_citations=True
        )
        
        # If patterns requested, add pattern context
        if include_patterns and matter_id:
            pattern_service = PatternDetectionService(db)
            patterns = pattern_service.detect_rico_patterns(matter_id=matter_id)
            
            # Add pattern summary to result
            result['patterns'] = {
                'recurring_actors_count': len(patterns.get('recurring_actors', [])),
                'timing_sequences_count': len(patterns.get('timing_sequences', [])),
                'coordinated_actions_count': len(patterns.get('coordinated_actions', [])),
                'overall_confidence': patterns.get('overall_confidence', 0.0)
            }
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@router.post("/rag/generate-summary")
async def generate_summary(
    matter_id: Optional[str] = Query(None, description="Filter by matter ID"),
    document_ids: Optional[List[str]] = Query(None, description="Filter by document IDs"),
    summary_type: str = Query('comprehensive', description="Summary type: comprehensive, timeline, key_facts"),
    db: Session = Depends(get_db)
):
    """
    Generate AI-assisted summary or outline.
    
    Returns:
        Dict with generated summary
    """
    try:
        rag_service = RAGService(db)
        
        if summary_type == 'timeline':
            # Generate timeline summary
            timeline_service = TimelineService(db)
            timeline = timeline_service.get_timeline(matter_id=matter_id, limit=50)
            
            # Use RAG to generate narrative summary
            timeline_text = "\n".join([
                f"{event.get('event_date', 'Unknown date')}: {event.get('event_name', 'Event')}"
                for event in timeline
            ])
            
            prompt = f"""Based on the following chronological timeline of events, provide a comprehensive narrative summary:

{timeline_text}

Provide a clear, chronological summary of these events."""
            
            result = rag_service.query(
                question=prompt,
                matter_id=matter_id,
                document_ids=document_ids,
                include_citations=False
            )
            
            return {
                'summary_type': 'timeline',
                'summary': result.get('answer', ''),
                'events_count': len(timeline),
                'timeline': timeline
            }
        
        elif summary_type == 'key_facts':
            # Generate key facts summary
            prompt = """Provide a summary of the key facts, entities, and relationships in this case. Focus on the most important information."""
            
            result = rag_service.query(
                question=prompt,
                matter_id=matter_id,
                document_ids=document_ids,
                include_citations=True
            )
            
            return {
                'summary_type': 'key_facts',
                'summary': result.get('answer', ''),
                'citations': result.get('citations', [])
            }
        
        else:  # comprehensive
            # Generate comprehensive summary
            prompt = """Provide a comprehensive summary of this case, including:
1. Overview of the matter
2. Key entities and their roles
3. Important events and timeline
4. Key documents and evidence
5. Notable patterns or relationships"""
            
            result = rag_service.query(
                question=prompt,
                matter_id=matter_id,
                document_ids=document_ids,
                include_citations=True
            )
            
            # Add pattern context
            if matter_id:
                pattern_service = PatternDetectionService(db)
                patterns = pattern_service.detect_rico_patterns(matter_id=matter_id)
                
                return {
                    'summary_type': 'comprehensive',
                    'summary': result.get('answer', ''),
                    'citations': result.get('citations', []),
                    'patterns': {
                        'recurring_actors': patterns.get('recurring_actors', [])[:5],
                        'timing_sequences': patterns.get('timing_sequences', [])[:5],
                        'overall_confidence': patterns.get('overall_confidence', 0.0)
                    }
                }
            
            return {
                'summary_type': 'comprehensive',
                'summary': result.get('answer', ''),
                'citations': result.get('citations', [])
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")

