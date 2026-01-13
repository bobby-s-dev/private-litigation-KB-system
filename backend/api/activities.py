"""FastAPI endpoints for activity logging and retrieval."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import Optional, List
from pydantic import BaseModel
import uuid
from datetime import datetime, timedelta

from database import get_db
from models import AuditLog, Matter, Document

router = APIRouter(prefix="/api/activities", tags=["activities"])


class ActivityCreate(BaseModel):
    action_type: str
    resource_type: str
    resource_id: str
    matter_id: Optional[str] = None
    description: str
    username: Optional[str] = None
    metadata: Optional[dict] = None


class ActivityResponse(BaseModel):
    id: str
    action_type: str
    resource_type: str
    resource_id: str
    matter_id: Optional[str]
    description: str
    username: Optional[str]
    created_at: str
    metadata: Optional[dict] = None
    
    class Config:
        from_attributes = True


def log_activity(
    db: Session,
    action_type: str,
    resource_type: str,
    resource_id: str,
    description: str,
    matter_id: Optional[str] = None,
    username: Optional[str] = None,
    metadata: Optional[dict] = None
):
    """Helper function to log an activity."""
    activity = AuditLog(
        action_type=action_type,
        resource_type=resource_type,
        resource_id=uuid.UUID(resource_id),
        description=description,
        username=username,
        metadata_json=metadata or {}
    )
    
    # Store matter_id in metadata if provided
    if matter_id:
        activity.metadata_json = activity.metadata_json or {}
        activity.metadata_json['matter_id'] = matter_id
    
    db.add(activity)
    db.commit()
    return activity


@router.post("", response_model=ActivityResponse)
async def create_activity(
    activity: ActivityCreate,
    db: Session = Depends(get_db)
):
    """Log a new activity."""
    try:
        # Validate resource_id is a valid UUID
        resource_uuid = uuid.UUID(activity.resource_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid resource_id format: {activity.resource_id}")
    
    # Validate matter_id if provided
    matter_uuid = None
    if activity.matter_id:
        try:
            matter_uuid = uuid.UUID(activity.matter_id)
            # Verify matter exists
            matter = db.query(Matter).filter(Matter.id == matter_uuid).first()
            if not matter:
                raise HTTPException(status_code=404, detail=f"Matter {activity.matter_id} not found")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid matter_id format: {activity.matter_id}")
    
    activity_obj = log_activity(
        db=db,
        action_type=activity.action_type,
        resource_type=activity.resource_type,
        resource_id=activity.resource_id,
        description=activity.description,
        matter_id=activity.matter_id,
        username=activity.username,
        metadata=activity.metadata
    )
    
    return ActivityResponse(
        id=str(activity_obj.id),
        action_type=activity_obj.action_type,
        resource_type=activity_obj.resource_type,
        resource_id=str(activity_obj.resource_id),
        matter_id=activity.matter_id,
        description=activity_obj.description,
        username=activity_obj.username,
        created_at=activity_obj.created_at.isoformat() if activity_obj.created_at else datetime.now().isoformat(),
        metadata=activity_obj.metadata_json
    )


@router.get("/matter/{matter_id}", response_model=List[ActivityResponse])
async def get_matter_activities(
    matter_id: str,
    limit: int = Query(20, description="Maximum number of activities to return"),
    offset: int = Query(0, description="Number of activities to skip"),
    db: Session = Depends(get_db)
):
    """Get activities for a specific matter."""
    try:
        matter_uuid = uuid.UUID(matter_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid matter ID format: {matter_id}")
    
    # Verify matter exists
    matter = db.query(Matter).filter(Matter.id == matter_uuid).first()
    if not matter:
        raise HTTPException(status_code=404, detail=f"Matter {matter_id} not found")
    
    # Get activities where:
    # 1. resource_type is 'matter' and resource_id matches
    # 2. resource_type is 'document' and the document belongs to this matter
    # 3. metadata contains matter_id
    
    # First, get document IDs for this matter
    document_ids = [str(doc.id) for doc in db.query(Document.id).filter(Document.matter_id == matter_uuid).all()]
    
    # Build query filters
    filters = [
        and_(AuditLog.resource_type == 'matter', AuditLog.resource_id == matter_uuid)
    ]
    
    # Add document filter if there are documents
    if document_ids:
        doc_uuids = [uuid.UUID(did) for did in document_ids]
        filters.append(
            and_(AuditLog.resource_type == 'document', AuditLog.resource_id.in_(doc_uuids))
        )
    
    # Add metadata filter (using JSONB contains operator)
    try:
        filters.append(
            AuditLog.metadata_json.contains({'matter_id': matter_id})
        )
    except:
        # Fallback if JSONB query fails
        pass
    
    # Query activities
    activities = db.query(AuditLog).filter(
        or_(*filters)
    ).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    
    result = []
    for activity in activities:
        # Extract matter_id from metadata if available
        activity_matter_id = activity.metadata_json.get('matter_id') if activity.metadata_json else None
        if not activity_matter_id and activity.resource_type == 'matter':
            activity_matter_id = matter_id
        
        result.append(ActivityResponse(
            id=str(activity.id),
            action_type=activity.action_type,
            resource_type=activity.resource_type,
            resource_id=str(activity.resource_id),
            matter_id=activity_matter_id,
            description=activity.description or '',
            username=activity.username,
            created_at=activity.created_at.isoformat() if activity.created_at else datetime.now().isoformat(),
            metadata=activity.metadata_json
        ))
    
    return result

