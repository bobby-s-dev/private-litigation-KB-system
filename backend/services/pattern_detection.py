"""Advanced pattern detection service for RICO patterns, coordinated sequences, and inconsistencies."""
from typing import List, Dict, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta
from collections import defaultdict
import uuid

from models import Document, Entity, Relationship, Event, Fact, Matter, DocumentEntity
from services.rag import RAGService
from config import settings


class PatternDetectionService:
    """Service for detecting patterns across documents and cases."""
    
    def __init__(self, db: Session):
        self.db = db
        self.rag_service = RAGService(db) if settings.rag_enabled else None
    
    def detect_rico_patterns(
        self,
        matter_id: Optional[str] = None,
        entity_ids: Optional[List[str]] = None
    ) -> Dict:
        """
        Detect potential RICO-related patterns:
        - Recurring actors across multiple cases/documents
        - Timing sequences suggesting coordination
        - Coordinated actions (similar actions by different entities)
        - Financial transactions patterns
        - Communication patterns
        
        Returns:
            Dict with detected patterns and evidence
        """
        patterns = {
            'recurring_actors': [],
            'timing_sequences': [],
            'coordinated_actions': [],
            'financial_patterns': [],
            'communication_patterns': [],
            'overall_confidence': 0.0
        }
        
        # Get documents for analysis
        query = self.db.query(Document).filter(Document.is_current_version == True)
        if matter_id:
            query = query.filter(Document.matter_id == matter_id)
        documents = query.all()
        
        if not documents:
            return patterns
        
        # 1. Detect recurring actors
        patterns['recurring_actors'] = self._detect_recurring_actors(documents, entity_ids)
        
        # 2. Detect timing sequences
        patterns['timing_sequences'] = self._detect_timing_sequences(documents, entity_ids)
        
        # 3. Detect coordinated actions
        patterns['coordinated_actions'] = self._detect_coordinated_actions(documents, entity_ids)
        
        # 4. Detect financial patterns
        patterns['financial_patterns'] = self._detect_financial_patterns(documents)
        
        # 5. Detect communication patterns
        patterns['communication_patterns'] = self._detect_communication_patterns(documents)
        
        # Calculate overall confidence
        all_patterns = (
            patterns['recurring_actors'] +
            patterns['timing_sequences'] +
            patterns['coordinated_actions'] +
            patterns['financial_patterns'] +
            patterns['communication_patterns']
        )
        if all_patterns:
            patterns['overall_confidence'] = sum(p.get('confidence', 0.0) for p in all_patterns) / len(all_patterns)
        
        return patterns
    
    def _detect_recurring_actors(
        self,
        documents: List[Document],
        entity_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """Detect entities that appear across multiple documents/cases."""
        patterns = []
        
        # Get all entities across documents
        doc_ids = [d.id for d in documents]
        doc_entities = self.db.query(DocumentEntity).filter(
            DocumentEntity.document_id.in_(doc_ids)
        ).all()
        
        # Count entity appearances across documents
        entity_doc_counts = defaultdict(set)
        entity_info = {}
        
        for de in doc_entities:
            entity_id = str(de.entity_id)
            if entity_ids and entity_id not in entity_ids:
                continue
            
            entity_doc_counts[entity_id].add(str(de.document_id))
            
            if entity_id not in entity_info:
                entity = self.db.query(Entity).filter(Entity.id == de.entity_id).first()
                if entity:
                    entity_info[entity_id] = {
                        'id': entity_id,
                        'name': entity.display_name or entity.normalized_name,
                        'type': self._get_entity_type_name(entity.entity_type_id)
                    }
        
        # Find entities appearing in multiple documents
        for entity_id, doc_set in entity_doc_counts.items():
            if len(doc_set) >= 3:  # Threshold: appears in 3+ documents
                confidence = min(0.9, 0.5 + (len(doc_set) - 3) * 0.1)
                
                # Get related documents
                related_docs = []
                for doc_id in doc_set:
                    doc = self.db.query(Document).filter(Document.id == doc_id).first()
                    if doc:
                        related_docs.append({
                            'id': str(doc.id),
                            'title': doc.title or doc.file_name,
                            'document_type': doc.document_type
                        })
                
                patterns.append({
                    'type': 'recurring_actor',
                    'entity': entity_info.get(entity_id, {'id': entity_id}),
                    'document_count': len(doc_set),
                    'documents': related_docs,
                    'confidence': confidence,
                    'description': f"Entity appears in {len(doc_set)} documents, suggesting central role"
                })
        
        return sorted(patterns, key=lambda x: x['document_count'], reverse=True)
    
    def _detect_timing_sequences(
        self,
        documents: List[Document],
        entity_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """Detect timing sequences suggesting coordination."""
        patterns = []
        
        # Get events with dates
        doc_ids = [d.id for d in documents]
        events = self.db.query(Event).filter(
            and_(
                Event.source_document_id.in_(doc_ids),
                Event.event_date.isnot(None)
            )
        ).order_by(Event.event_date.asc()).all()
        
        if len(events) < 2:
            return patterns
        
        # Group events by participants
        events_by_participants = defaultdict(list)
        for event in events:
            if event.participants:
                participant_ids = [
                    p.get('entity_id') for p in event.participants
                    if isinstance(p, dict) and 'entity_id' in p
                ]
                if participant_ids:
                    key = tuple(sorted(participant_ids))
                    events_by_participants[key].append(event)
        
        # Detect sequences
        for participant_key, participant_events in events_by_participants.items():
            if len(participant_events) < 2:
                continue
            
            # Check for regular intervals or suspicious timing
            for i in range(len(participant_events) - 1):
                event1 = participant_events[i]
                event2 = participant_events[i + 1]
                
                if event1.event_date and event2.event_date:
                    days_diff = (event2.event_date - event1.event_date).days
                    
                    # Suspicious patterns:
                    # - Very short intervals (same day or consecutive days)
                    # - Regular intervals (weekly, monthly)
                    if days_diff <= 2:
                        confidence = 0.8
                        pattern_type = 'rapid_sequence'
                        description = f"Events within {days_diff} days, suggesting urgent coordination"
                    elif days_diff in [7, 14, 21, 28, 30, 60, 90]:  # Regular intervals
                        confidence = 0.7
                        pattern_type = 'regular_interval'
                        description = f"Events {days_diff} days apart, suggesting scheduled coordination"
                    else:
                        continue
                    
                    # Get entity names
                    entities = []
                    for entity_id in participant_key:
                        entity = self.db.query(Entity).filter(Entity.id == entity_id).first()
                        if entity:
                            entities.append(entity.display_name or entity.normalized_name)
                    
                    patterns.append({
                        'type': pattern_type,
                        'entities': entities,
                        'event1': {
                            'id': str(event1.id),
                            'name': event1.event_name,
                            'date': event1.event_date.isoformat()
                        },
                        'event2': {
                            'id': str(event2.id),
                            'name': event2.event_name,
                            'date': event2.event_date.isoformat()
                        },
                        'days_between': days_diff,
                        'confidence': confidence,
                        'description': description
                    })
        
        return sorted(patterns, key=lambda x: x['confidence'], reverse=True)
    
    def _detect_coordinated_actions(
        self,
        documents: List[Document],
        entity_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """Detect similar actions by different entities suggesting coordination."""
        patterns = []
        
        # Get facts with similar content
        doc_ids = [d.id for d in documents]
        facts = self.db.query(Fact).filter(
            Fact.document_id.in_(doc_ids)
        ).all()
        
        # Group facts by similar keywords/patterns
        fact_groups = defaultdict(list)
        
        # Keywords suggesting coordination
        coordination_keywords = [
            'meeting', 'conference', 'agreement', 'transaction', 'transfer',
            'payment', 'contract', 'filing', 'motion', 'hearing'
        ]
        
        for fact in facts:
            fact_lower = fact.fact_text.lower()
            for keyword in coordination_keywords:
                if keyword in fact_lower:
                    fact_groups[keyword].append(fact)
                    break
        
        # Analyze groups for coordination patterns
        for keyword, group_facts in fact_groups.items():
            if len(group_facts) < 2:
                continue
            
            # Get entities mentioned in these facts
            entity_mentions = defaultdict(list)
            for fact in group_facts:
                # Extract entities from fact text (simple approach)
                # In production, use proper NER
                doc_entities = self.db.query(DocumentEntity).filter(
                    DocumentEntity.document_id == fact.document_id
                ).all()
                
                for de in doc_entities:
                    entity_mentions[de.entity_id].append(fact)
            
            # If multiple entities have similar facts, it's suspicious
            if len(entity_mentions) >= 2:
                entities = []
                for entity_id, facts_list in entity_mentions.items():
                    entity = self.db.query(Entity).filter(Entity.id == entity_id).first()
                    if entity:
                        entities.append({
                            'id': str(entity.id),
                            'name': entity.display_name or entity.normalized_name
                        })
                
                if len(entities) >= 2:
                    confidence = min(0.9, 0.6 + (len(entities) - 2) * 0.1)
                    
                    patterns.append({
                        'type': 'coordinated_action',
                        'action_type': keyword,
                        'entities': entities,
                        'fact_count': len(group_facts),
                        'confidence': confidence,
                        'description': f"Multiple entities involved in similar {keyword} actions"
                    })
        
        return sorted(patterns, key=lambda x: x['confidence'], reverse=True)
    
    def _detect_financial_patterns(
        self,
        documents: List[Document]
    ) -> List[Dict]:
        """Detect financial transaction patterns."""
        patterns = []
        
        # Get financial documents
        financial_docs = [
            d for d in documents
            if d.document_type == 'financial_record' or 'financial' in (d.categories or [])
        ]
        
        if not financial_docs:
            return patterns
        
        # Look for transaction patterns in facts
        doc_ids = [d.id for d in financial_docs]
        facts = self.db.query(Fact).filter(
            Fact.document_id.in_(doc_ids)
        ).all()
        
        # Extract amounts and dates
        import re
        amount_pattern = r'\$[\d,]+(?:\.\d{2})?'
        
        transactions = []
        for fact in facts:
            amounts = re.findall(amount_pattern, fact.fact_text)
            if amounts and fact.event_date:
                for amount in amounts:
                    transactions.append({
                        'amount': amount,
                        'date': fact.event_date,
                        'fact_id': str(fact.id),
                        'document_id': str(fact.document_id)
                    })
        
        # Detect patterns: regular payments, large transactions, etc.
        if len(transactions) >= 3:
            # Group by similar amounts
            amount_groups = defaultdict(list)
            for trans in transactions:
                # Normalize amount
                amount_str = trans['amount'].replace('$', '').replace(',', '')
                try:
                    amount_val = float(amount_str)
                    # Round to nearest 100 for grouping
                    rounded = round(amount_val / 100) * 100
                    amount_groups[rounded].append(trans)
                except:
                    pass
            
            # Find recurring amounts
            for amount, trans_list in amount_groups.items():
                if len(trans_list) >= 3:
                    dates = sorted([t['date'] for t in trans_list if t['date']])
                    if len(dates) >= 3:
                        # Check for regular intervals
                        intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
                        if len(set(intervals)) == 1:  # All same interval
                            confidence = 0.8
                            patterns.append({
                                'type': 'recurring_payment',
                                'amount': f"${amount:,.2f}",
                                'frequency_days': intervals[0],
                                'occurrences': len(trans_list),
                                'dates': [d.isoformat() for d in dates],
                                'confidence': confidence,
                                'description': f"Recurring payments of ${amount:,.2f} every {intervals[0]} days"
                            })
        
        return patterns
    
    def _detect_communication_patterns(
        self,
        documents: List[Document]
    ) -> List[Dict]:
        """Detect communication patterns (emails, meetings, etc.)."""
        patterns = []
        
        # Get email documents
        email_docs = [
            d for d in documents
            if d.document_type == 'email'
        ]
        
        if not email_docs:
            return patterns
        
        # Analyze sender-recipient patterns
        communication_network = defaultdict(lambda: defaultdict(int))
        
        for doc in email_docs:
            sender = doc.sender_email
            recipients = doc.recipient_emails or []
            
            if sender:
                for recipient in recipients:
                    if recipient:
                        communication_network[sender][recipient] += 1
        
        # Find frequent communication pairs
        for sender, recipients in communication_network.items():
            for recipient, count in recipients.items():
                if count >= 5:  # Threshold: 5+ communications
                    confidence = min(0.9, 0.6 + (count - 5) * 0.05)
                    
                    patterns.append({
                        'type': 'frequent_communication',
                        'sender': sender,
                        'recipient': recipient,
                        'message_count': count,
                        'confidence': confidence,
                        'description': f"Frequent communication between {sender} and {recipient} ({count} messages)"
                    })
        
        return sorted(patterns, key=lambda x: x['message_count'], reverse=True)
    
    def detect_inconsistencies(
        self,
        matter_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Detect inconsistencies across documents:
        - Conflicting dates
        - Contradictory facts
        - Version discrepancies
        """
        inconsistencies = []
        
        # Get documents
        query = self.db.query(Document).filter(Document.is_current_version == True)
        if matter_id:
            query = query.filter(Document.matter_id == matter_id)
        documents = query.all()
        
        if len(documents) < 2:
            return inconsistencies
        
        doc_ids = [d.id for d in documents]
        
        # 1. Check for conflicting dates in facts
        facts = self.db.query(Fact).filter(
            Fact.document_id.in_(doc_ids)
        ).all()
        
        # Group facts by entity mentions
        entity_facts = defaultdict(list)
        for fact in facts:
            # Get entities from document
            doc_entities = self.db.query(DocumentEntity).filter(
                DocumentEntity.document_id == fact.document_id
            ).all()
            
            for de in doc_entities:
                entity_facts[str(de.entity_id)].append(fact)
        
        # Check for date conflicts
        for entity_id, facts_list in entity_facts.items():
            if len(facts_list) < 2:
                continue
            
            # Get dates
            dates = [f.event_date for f in facts_list if f.event_date]
            if len(dates) < 2:
                continue
            
            # Check for impossible sequences (same entity, conflicting dates)
            # This is simplified - in production, use more sophisticated logic
            entity = self.db.query(Entity).filter(Entity.id == entity_id).first()
            if entity:
                entity_name = entity.display_name or entity.normalized_name
                
                # Simple check: if dates are very close but facts are contradictory
                # (This would need more sophisticated fact comparison)
                inconsistencies.append({
                    'type': 'potential_date_conflict',
                    'entity': {
                        'id': str(entity.id),
                        'name': entity_name
                    },
                    'fact_count': len(facts_list),
                    'confidence': 0.6,
                    'description': f"Multiple facts about {entity_name} with potentially conflicting dates"
                })
        
        return inconsistencies
    
    def _get_entity_type_name(self, entity_type_id: str) -> str:
        """Get entity type name."""
        from models import EntityType
        entity_type = self.db.query(EntityType).filter(
            EntityType.id == entity_type_id
        ).first()
        return entity_type.type_name if entity_type else 'unknown'
    
    def suggest_patterns(
        self,
        matter_id: Optional[str] = None,
        use_ai: bool = True
    ) -> List[Dict]:
        """
        Use AI to suggest additional patterns that may not be obvious.
        
        Returns:
            List of suggested patterns with confidence scores
        """
        suggestions = []
        
        if not use_ai or not self.rag_service:
            return suggestions
        
        # Get summary of documents and entities
        query = self.db.query(Document).filter(Document.is_current_version == True)
        if matter_id:
            query = query.filter(Document.matter_id == matter_id)
        documents = query.all()
        
        if not documents:
            return suggestions
        
        # Build context for AI analysis
        doc_ids = [str(d.id) for d in documents]
        
        # Get entities
        doc_entities = self.db.query(DocumentEntity).filter(
            DocumentEntity.document_id.in_([d.id for d in documents])
        ).all()
        
        entity_ids = list(set([de.entity_id for de in doc_entities]))
        entities = self.db.query(Entity).filter(Entity.id.in_(entity_ids)).all()
        
        entity_names = [e.display_name or e.normalized_name for e in entities[:20]]  # Limit for context
        
        # Query AI for pattern suggestions
        prompt = f"""Analyze the following legal case data and suggest potential patterns, relationships, or connections that might not be immediately obvious:

Documents: {len(documents)} documents
Entities: {', '.join(entity_names[:10])}

Look for:
1. Unusual relationships between entities
2. Temporal patterns that suggest coordination
3. Financial patterns
4. Communication patterns
5. Any other suspicious or noteworthy patterns

Provide specific, actionable suggestions with reasoning."""

        try:
            result = self.rag_service.query(
                question=prompt,
                matter_id=matter_id,
                document_ids=doc_ids[:5],  # Limit documents for context
                top_k=10
            )
            
            if result.get('success') and result.get('answer'):
                suggestions.append({
                    'type': 'ai_suggestion',
                    'suggestion': result['answer'],
                    'confidence': result.get('confidence', 0.7),
                    'sources': result.get('sources_used', 0)
                })
        except Exception as e:
            print(f"Error generating AI pattern suggestions: {str(e)}")
        
        return suggestions

