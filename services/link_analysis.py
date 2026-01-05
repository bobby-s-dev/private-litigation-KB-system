"""Link analysis service for analyzing relationships between entities, documents, and events."""
from typing import List, Dict, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from collections import defaultdict, deque

from models import Document, Entity, Relationship, Event, Matter, DocumentEvent, DocumentEntity


class LinkAnalysisService:
    """Service for analyzing links and relationships."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def find_entity_connections(
        self,
        entity_id: str,
        max_depth: int = 2,
        relationship_types: Optional[List[str]] = None
    ) -> Dict:
        """
        Find all entities connected to a given entity.
        
        Args:
            entity_id: Starting entity ID
            max_depth: Maximum relationship depth to traverse
            relationship_types: Filter by relationship types
        
        Returns:
            Dict with entity network graph
        """
        visited = set()
        graph = {
            'nodes': [],
            'edges': [],
            'depth': max_depth
        }
        
        # BFS traversal
        queue = deque([(entity_id, 0)])
        visited.add(entity_id)
        
        while queue:
            current_id, depth = queue.popleft()
            
            if depth >= max_depth:
                continue
            
            # Find relationships
            relationships = self.db.query(Relationship).filter(
                or_(
                    Relationship.source_entity_id == current_id,
                    Relationship.target_entity_id == current_id
                )
            )
            
            if relationship_types:
                # Filter by relationship type names
                from models import RelationshipType
                type_ids = self.db.query(RelationshipType.id).filter(
                    RelationshipType.type_name.in_(relationship_types)
                ).all()
                type_ids = [t[0] for t in type_ids]
                relationships = relationships.filter(
                    Relationship.relationship_type_id.in_(type_ids)
                )
            
            relationships = relationships.all()
            
            for rel in relationships:
                # Determine connected entity
                connected_id = rel.target_entity_id if rel.source_entity_id == current_id else rel.source_entity_id
                
                # Add edge
                edge = {
                    'from': str(current_id),
                    'to': str(connected_id),
                    'relationship_type': self._get_relationship_type_name(rel.relationship_type_id),
                    'strength': float(rel.strength) if rel.strength else None,
                    'confidence': float(rel.confidence_score) if rel.confidence_score else None,
                    'is_directional': rel.source_entity_id == current_id
                }
                graph['edges'].append(edge)
                
                # Add to queue if not visited
                if connected_id not in visited:
                    visited.add(connected_id)
                    queue.append((connected_id, depth + 1))
                    
                    # Add node
                    entity = self.db.query(Entity).filter(Entity.id == connected_id).first()
                    if entity:
                        graph['nodes'].append(self._format_entity_node(entity))
        
        # Add starting node
        start_entity = self.db.query(Entity).filter(Entity.id == entity_id).first()
        if start_entity:
            graph['nodes'].insert(0, self._format_entity_node(start_entity, is_root=True))
        
        return graph
    
    def find_document_connections(
        self,
        document_id: str,
        via_entities: bool = True,
        via_events: bool = True
    ) -> Dict:
        """
        Find documents connected to a given document.
        
        Args:
            document_id: Starting document ID
            via_entities: Find connections via shared entities
            via_events: Find connections via shared events
        
        Returns:
            Dict with connected documents and connection types
        """
        document = self.db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return {'connected_documents': [], 'connection_types': {}}
        
        connected_docs = {}
        connection_types = defaultdict(set)
        
        if via_entities:
            # Find entities in this document
            doc_entities = self.db.query(DocumentEntity).filter(
                DocumentEntity.document_id == document_id
            ).all()
            
            entity_ids = [de.entity_id for de in doc_entities]
            
            # Find other documents with same entities
            other_docs = self.db.query(DocumentEntity).filter(
                and_(
                    DocumentEntity.document_id != document_id,
                    DocumentEntity.entity_id.in_(entity_ids)
                )
            ).all()
            
            for doc_entity in other_docs:
                doc_id = str(doc_entity.document_id)
                if doc_id not in connected_docs:
                    doc = self.db.query(Document).filter(Document.id == doc_entity.document_id).first()
                    if doc:
                        connected_docs[doc_id] = self._format_document(doc)
                connection_types[doc_id].add('shared_entity')
        
        if via_events:
            # Find events in this document
            doc_events = self.db.query(DocumentEvent).filter(
                DocumentEvent.document_id == document_id
            ).all()
            
            event_ids = [de.event_id for de in doc_events]
            
            # Find other documents with same events
            other_docs = self.db.query(DocumentEvent).filter(
                and_(
                    DocumentEvent.document_id != document_id,
                    DocumentEvent.event_id.in_(event_ids)
                )
            ).all()
            
            for doc_event in other_docs:
                doc_id = str(doc_event.document_id)
                if doc_id not in connected_docs:
                    doc = self.db.query(Document).filter(Document.id == doc_event.document_id).first()
                    if doc:
                        connected_docs[doc_id] = self._format_document(doc)
                connection_types[doc_id].add('shared_event')
        
        return {
            'connected_documents': list(connected_docs.values()),
            'connection_types': {k: list(v) for k, v in connection_types.items()},
            'total_connections': len(connected_docs)
        }
    
    def find_event_connections(
        self,
        event_id: str,
        via_participants: bool = True,
        via_temporal_proximity: bool = True,
        days_threshold: int = 30
    ) -> Dict:
        """
        Find events connected to a given event.
        
        Args:
            event_id: Starting event ID
            via_participants: Find events with shared participants
            via_temporal_proximity: Find events within time window
            days_threshold: Days for temporal proximity
        
        Returns:
            Dict with connected events
        """
        event = self.db.query(Event).filter(Event.id == event_id).first()
        if not event:
            return {'connected_events': []}
        
        connected_events = {}
        
        if via_participants and event.participants:
            # Find events with shared participants
            participant_entity_ids = [
                p.get('entity_id') for p in event.participants
                if isinstance(p, dict) and 'entity_id' in p
            ]
            
            if participant_entity_ids:
                # Find events where participants overlap
                from sqlalchemy import func
                other_events = self.db.query(Event).filter(
                    and_(
                        Event.id != event_id,
                        Event.participants.isnot(None)
                    )
                ).all()
                
                for other_event in other_events:
                    if not other_event.participants:
                        continue
                    
                    other_participants = [
                        p.get('entity_id') for p in other_event.participants
                        if isinstance(p, dict) and 'entity_id' in p
                    ]
                    
                    # Check for overlap
                    if set(participant_entity_ids) & set(other_participants):
                        connected_events[str(other_event.id)] = {
                            'connection_type': 'shared_participant',
                            'event': self._format_event(other_event)
                        }
        
        if via_temporal_proximity and event.event_date:
            # Find events within time window
            from datetime import timedelta
            start_date = event.event_date - timedelta(days=days_threshold)
            end_date = event.event_date + timedelta(days=days_threshold)
            
            temporal_events = self.db.query(Event).filter(
                and_(
                    Event.id != event_id,
                    Event.event_date.between(start_date, end_date)
                )
            ).all()
            
            for temp_event in temporal_events:
                event_id_str = str(temp_event.id)
                if event_id_str not in connected_events:
                    connected_events[event_id_str] = {
                        'connection_type': 'temporal_proximity',
                        'event': self._format_event(temp_event)
                    }
                else:
                    connected_events[event_id_str]['connection_type'] += ', temporal_proximity'
        
        return {
            'connected_events': list(connected_events.values()),
            'total_connections': len(connected_events)
        }
    
    def analyze_matter_network(
        self,
        matter_id: str
    ) -> Dict:
        """
        Analyze the complete network for a matter.
        
        Returns:
            Dict with entities, relationships, events, and documents
        """
        # Get all documents in matter
        documents = self.db.query(Document).filter(
            and_(
                Document.matter_id == matter_id,
                Document.is_current_version == True
            )
        ).all()
        
        # Get all entities
        from models import DocumentEntity
        doc_ids = [d.id for d in documents]
        doc_entities = self.db.query(DocumentEntity).filter(
            DocumentEntity.document_id.in_(doc_ids)
        ).all()
        
        entity_ids = list(set([de.entity_id for de in doc_entities]))
        entities = self.db.query(Entity).filter(Entity.id.in_(entity_ids)).all()
        
        # Get all relationships
        relationships = self.db.query(Relationship).filter(
            Relationship.source_entity_id.in_(entity_ids)
        ).all()
        
        # Get all events
        events = self.db.query(Event).filter(
            Event.source_document_id.in_(doc_ids)
        ).all()
        
        return {
            'matter_id': matter_id,
            'statistics': {
                'documents': len(documents),
                'entities': len(entities),
                'relationships': len(relationships),
                'events': len(events)
            },
            'entities': [self._format_entity_node(e) for e in entities],
            'relationships': [self._format_relationship(r) for r in relationships],
            'events': [self._format_event(e) for e in events],
            'documents': [self._format_document(d) for d in documents]
        }
    
    def _get_relationship_type_name(self, type_id: str) -> str:
        """Get relationship type name."""
        from models import RelationshipType
        rel_type = self.db.query(RelationshipType).filter(
            RelationshipType.id == type_id
        ).first()
        return rel_type.type_name if rel_type else 'unknown'
    
    def _format_entity_node(self, entity: Entity, is_root: bool = False) -> Dict:
        """Format entity as graph node."""
        return {
            'id': str(entity.id),
            'name': entity.display_name or entity.normalized_name,
            'type': 'entity',
            'is_root': is_root
        }
    
    def _format_relationship(self, relationship: Relationship) -> Dict:
        """Format relationship."""
        return {
            'id': str(relationship.id),
            'from': str(relationship.source_entity_id),
            'to': str(relationship.target_entity_id),
            'type': self._get_relationship_type_name(relationship.relationship_type_id),
            'strength': float(relationship.strength) if relationship.strength else None
        }
    
    def _format_event(self, event: Event) -> Dict:
        """Format event."""
        return {
            'id': str(event.id),
            'event_name': event.event_name,
            'event_type': event.event_type,
            'event_date': event.event_date.isoformat() if event.event_date else None
        }
    
    def _format_document(self, document: Document) -> Dict:
        """Format document."""
        return {
            'id': str(document.id),
            'title': document.title or document.file_name,
            'file_name': document.file_name,
            'document_type': document.document_type
        }

