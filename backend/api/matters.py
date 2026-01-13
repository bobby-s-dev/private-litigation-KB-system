"""FastAPI endpoints for matter management."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
import uuid

from database import get_db
from models import Matter, Document, EmbeddingsMetadata, Fact
from services.indexing import IndexingService
from api.activities import log_activity

router = APIRouter(prefix="/api/matters", tags=["matters"])


class MatterCreate(BaseModel):
    matter_number: str
    matter_name: str
    matter_type: str = "other"
    jurisdiction: Optional[str] = None
    court_name: Optional[str] = None
    case_number: Optional[str] = None
    description: Optional[str] = None


class MatterResponse(BaseModel):
    id: str
    matter_number: str
    matter_name: str
    matter_type: str
    jurisdiction: Optional[str]
    court_name: Optional[str]
    case_number: Optional[str]
    status: str
    description: Optional[str]
    created_at: Optional[str]
    
    class Config:
        from_attributes = True


@router.get("", response_model=List[MatterResponse])
async def list_matters(
    limit: int = Query(100, description="Maximum number of matters to return"),
    offset: int = Query(0, description="Number of matters to skip"),
    db: Session = Depends(get_db)
):
    """Get list of all matters."""
    matters = db.query(Matter).order_by(Matter.created_at.desc()).offset(offset).limit(limit).all()
    
    return [
        MatterResponse(
            id=str(m.id),
            matter_number=m.matter_number,
            matter_name=m.matter_name,
            matter_type=m.matter_type,
            jurisdiction=m.jurisdiction,
            court_name=m.court_name,
            case_number=m.case_number,
            status=m.status,
            description=m.description,
            created_at=m.created_at.isoformat() if m.created_at else None,
        )
        for m in matters
    ]


@router.post("", response_model=MatterResponse)
async def create_matter(
    matter: MatterCreate,
    db: Session = Depends(get_db)
):
    """Create a new matter."""
    # Check if matter_number already exists
    existing = db.query(Matter).filter(Matter.matter_number == matter.matter_number).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Matter number '{matter.matter_number}' already exists")
    
    # Create new matter
    new_matter = Matter(
        id=uuid.uuid4(),
        matter_number=matter.matter_number,
        matter_name=matter.matter_name,
        matter_type=matter.matter_type,
        jurisdiction=matter.jurisdiction,
        court_name=matter.court_name,
        case_number=matter.case_number,
        description=matter.description,
        status='active'
    )
    
    db.add(new_matter)
    db.commit()
    db.refresh(new_matter)
    
    # Log activity
    try:
        log_activity(
            db=db,
            action_type='create',
            resource_type='matter',
            resource_id=str(new_matter.id),
            description=f'Created case "{new_matter.matter_name}" ({new_matter.matter_number})',
            matter_id=str(new_matter.id),
            username=None
        )
    except Exception as e:
        # Don't fail if activity logging fails
        print(f"Error logging activity: {e}")
    
    return MatterResponse(
        id=str(new_matter.id),
        matter_number=new_matter.matter_number,
        matter_name=new_matter.matter_name,
        matter_type=new_matter.matter_type,
        jurisdiction=new_matter.jurisdiction,
        court_name=new_matter.court_name,
        case_number=new_matter.case_number,
        status=new_matter.status,
        description=new_matter.description,
        created_at=new_matter.created_at.isoformat() if new_matter.created_at else None,
    )


@router.get("/{matter_id}", response_model=MatterResponse)
async def get_matter(
    matter_id: str,
    db: Session = Depends(get_db)
):
    """Get a specific matter by ID."""
    # Validate UUID format
    try:
        matter_uuid = uuid.UUID(matter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid matter ID format: {matter_id}")
    
    matter = db.query(Matter).filter(Matter.id == matter_uuid).first()
    if not matter:
        raise HTTPException(status_code=404, detail=f"Matter {matter_id} not found")
    
    return MatterResponse(
        id=str(matter.id),
        matter_number=matter.matter_number,
        matter_name=matter.matter_name,
        matter_type=matter.matter_type,
        jurisdiction=matter.jurisdiction,
        court_name=matter.court_name,
        case_number=matter.case_number,
        status=matter.status,
        description=matter.description,
        created_at=matter.created_at.isoformat() if matter.created_at else None,
    )


@router.get("/by-number/{matter_number}", response_model=MatterResponse)
async def get_matter_by_number(
    matter_number: str,
    db: Session = Depends(get_db)
):
    """Get a matter by matter_number."""
    matter = db.query(Matter).filter(Matter.matter_number == matter_number).first()
    if not matter:
        raise HTTPException(status_code=404, detail=f"Matter with number '{matter_number}' not found")
    
    return MatterResponse(
        id=str(matter.id),
        matter_number=matter.matter_number,
        matter_name=matter.matter_name,
        matter_type=matter.matter_type,
        jurisdiction=matter.jurisdiction,
        court_name=matter.court_name,
        case_number=matter.case_number,
        status=matter.status,
        description=matter.description,
        created_at=matter.created_at.isoformat() if matter.created_at else None,
    )


@router.delete("/{matter_id}")
async def delete_matter(
    matter_id: str,
    delete_with_data: bool = Query(False, description="If True, delete all associated data (documents, embeddings, etc.). If False, only delete the matter record."),
    db: Session = Depends(get_db)
):
    """Delete a matter. Optionally delete all associated data."""
    # Validate UUID format
    try:
        matter_uuid = uuid.UUID(matter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid matter ID format: {matter_id}")
    
    matter = db.query(Matter).filter(Matter.id == matter_uuid).first()
    if not matter:
        raise HTTPException(status_code=404, detail=f"Matter {matter_id} not found")
    
    matter_name = matter.matter_name
    matter_number = matter.matter_number
    
    try:
        if delete_with_data:
            # Get all documents for this matter
            documents = db.query(Document).filter(Document.matter_id == matter_uuid).all()
            
            # Delete embeddings for all documents
            indexing_service = IndexingService(db)
            for document in documents:
                try:
                    result = indexing_service.delete_document_index(str(document.id))
                    if not result.get('success'):
                        # Log error but continue with deletion
                        print(f"Warning: Failed to delete embeddings for document {document.id}: {result.get('error', 'Unknown error')}")
                except Exception as e:
                    # Log error but continue with deletion
                    print(f"Error deleting embeddings for document {document.id}: {e}")
                    import traceback
                    traceback.print_exc()
        
        # Explicitly delete facts first to avoid cascade constraint issues
        # Facts have foreign keys to both documents and matters, so we delete them explicitly
        facts_deleted = db.query(Fact).filter(Fact.matter_id == matter_uuid).delete()
        if facts_deleted > 0:
            print(f"Deleted {facts_deleted} facts for matter {matter_id}")
        
        # Delete the matter (this will cascade delete documents due to CASCADE)
        db.delete(matter)
        db.commit()
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to delete matter: {str(e)}")
    
    return {
        'id': matter_id,
        'matter_number': matter_number,
        'matter_name': matter_name,
        'deleted': True,
        'delete_with_data': delete_with_data
    }

