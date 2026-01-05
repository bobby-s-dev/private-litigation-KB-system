"""Timeline service for querying events chronologically."""
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import date, datetime

from models import Event, Document, Matter


class TimelineService:
    """Service for building and querying event timelines."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_timeline(
        self,
        matter_id: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        event_types: Optional[List[str]] = None,
        participant_entity_ids: Optional[List[str]] = None,
        location_text: Optional[str] = None,
        limit: Optional[int] = None
    ) -> List[Dict]:
        """
        Get chronological timeline of events.
        
        Args:
            matter_id: Filter by matter
            start_date: Start date filter
            end_date: End date filter
            event_types: Filter by event types
            participant_entity_ids: Filter by participant entities
            location_text: Filter by location
            limit: Maximum number of events
        
        Returns:
            List of events ordered chronologically
        """
        query = self.db.query(Event)
        
        # Filter by matter (via documents)
        if matter_id:
            query = query.join(Document).filter(Document.matter_id == matter_id)
        
        # Date filters
        if start_date:
            query = query.filter(
                or_(
                    Event.event_date >= start_date,
                    Event.date_range_start >= start_date if Event.date_range_start else False
                )
            )
        
        if end_date:
            query = query.filter(
                or_(
                    Event.event_date <= end_date,
                    Event.date_range_end <= end_date if Event.date_range_end else False
                )
            )
        
        # Event type filter
        if event_types:
            query = query.filter(Event.event_type.in_(event_types))
        
        # Participant filter
        if participant_entity_ids:
            # Filter events where participants JSONB contains any of the entity IDs
            conditions = []
            for entity_id in participant_entity_ids:
                conditions.append(
                    Event.participants.contains([{"entity_id": entity_id}])
                )
            if conditions:
                query = query.filter(or_(*conditions))
        
        # Location filter
        if location_text:
            query = query.filter(Event.location_text.ilike(f"%{location_text}%"))
        
        # Order by date
        query = query.order_by(
            Event.event_date.asc().nullslast(),
            Event.date_range_start.asc().nullslast(),
            Event.created_at.asc()
        )
        
        # Limit
        if limit:
            query = query.limit(limit)
        
        events = query.all()
        
        # Format for response
        timeline = []
        for event in events:
            timeline.append(self._format_event(event))
        
        return timeline
    
    def get_timeline_by_document(
        self,
        document_id: str
    ) -> List[Dict]:
        """Get timeline of events from a specific document."""
        events = self.db.query(Event).filter(
            Event.source_document_id == document_id
        ).order_by(
            Event.event_date.asc().nullslast(),
            Event.created_at.asc()
        ).all()
        
        return [self._format_event(event) for event in events]
    
    def get_timeline_summary(
        self,
        matter_id: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict:
        """
        Get summary statistics for timeline.
        
        Returns:
            Dict with counts by event type, date ranges, etc.
        """
        query = self.db.query(Event)
        
        if matter_id:
            query = query.join(Document).filter(Document.matter_id == matter_id)
        
        if start_date:
            query = query.filter(Event.event_date >= start_date)
        if end_date:
            query = query.filter(Event.event_date <= end_date)
        
        # Count by event type
        from sqlalchemy import func
        type_counts = query.with_entities(
            Event.event_type,
            func.count(Event.id).label('count')
        ).group_by(Event.event_type).all()
        
        # Date range
        date_range = query.with_entities(
            func.min(Event.event_date).label('earliest'),
            func.max(Event.event_date).label('latest')
        ).first()
        
        # Total count
        total_count = query.count()
        
        return {
            'total_events': total_count,
            'event_types': {event_type: count for event_type, count in type_counts},
            'date_range': {
                'earliest': date_range.earliest.isoformat() if date_range and date_range.earliest else None,
                'latest': date_range.latest.isoformat() if date_range and date_range.latest else None
            }
        }
    
    def _format_event(self, event: Event) -> Dict:
        """Format event for timeline response."""
        # Get document info
        document = None
        if event.source_document_id:
            document = self.db.query(Document).filter(
                Document.id == event.source_document_id
            ).first()
        
        return {
            'id': str(event.id),
            'event_type': event.event_type,
            'event_name': event.event_name,
            'description': event.description,
            'event_date': event.event_date.isoformat() if event.event_date else None,
            'event_datetime': event.event_datetime.isoformat() if event.event_datetime else None,
            'date_confidence': event.date_confidence,
            'date_range': {
                'start': event.date_range_start.isoformat() if event.date_range_start else None,
                'end': event.date_range_end.isoformat() if event.date_range_end else None
            },
            'location': event.location_text,
            'participants': event.participants or [],
            'confidence_score': float(event.confidence_score) if event.confidence_score else None,
            'source_document': {
                'id': str(document.id),
                'title': document.title or document.file_name,
                'file_name': document.file_name
            } if document else None,
            'is_verified': event.is_verified,
            'created_at': event.created_at.isoformat() if event.created_at else None
        }
    
    def get_events_by_date_range(
        self,
        start_date: date,
        end_date: date,
        matter_id: Optional[str] = None
    ) -> List[Dict]:
        """Get events within a date range."""
        return self.get_timeline(
            matter_id=matter_id,
            start_date=start_date,
            end_date=end_date
        )
    
    def get_upcoming_events(
        self,
        days_ahead: int = 30,
        matter_id: Optional[str] = None
    ) -> List[Dict]:
        """Get upcoming events within specified days."""
        from datetime import timedelta
        today = date.today()
        end_date = today + timedelta(days=days_ahead)
        
        return self.get_timeline(
            matter_id=matter_id,
            start_date=today,
            end_date=end_date
        )

