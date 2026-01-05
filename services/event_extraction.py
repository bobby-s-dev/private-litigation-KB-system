"""Event extraction service for extracting events from documents."""
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from datetime import datetime, date
import re
from openai import OpenAI, AzureOpenAI

from models import Document, Event, Entity
from config import settings


class EventExtractionService:
    """Service for extracting events from documents."""
    
    def __init__(self, db: Session):
        self.db = db
        
        # Initialize LLM client if using model-based extraction
        if settings.event_extraction_model or settings.rag_model:
            if settings.embedding_provider == "azure":
                self.llm_client = AzureOpenAI(
                    api_key=settings.azure_openai_api_key,
                    azure_endpoint=settings.azure_openai_endpoint,
                    api_version=settings.azure_openai_api_version
                ) if settings.azure_openai_api_key else None
            else:
                self.llm_client = OpenAI(
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url
                ) if settings.openai_api_key else None
        else:
            self.llm_client = None
    
    def extract_events_from_document(
        self,
        document_id: str,
        use_llm: bool = True
    ) -> List[Dict]:
        """
        Extract events from a document.
        
        Args:
            document_id: Document ID
            use_llm: Use LLM for extraction (more accurate but slower)
        
        Returns:
            List of extracted events with metadata
        """
        document = self.db.query(Document).filter(Document.id == document_id).first()
        if not document or not document.extracted_text:
            return []
        
        if use_llm and self.llm_client:
            return self._extract_with_llm(document)
        else:
            return self._extract_with_patterns(document)
    
    def _extract_with_llm(self, document: Document) -> List[Dict]:
        """Extract events using LLM."""
        if not self.llm_client:
            return self._extract_with_patterns(document)
        
        # Prepare text (limit length)
        text = document.extracted_text[:10000]  # Limit for LLM
        
        prompt = f"""Extract all events, dates, and important occurrences from the following legal document.
For each event, identify:
1. Event name/description
2. Date (if mentioned)
3. Participants (people or organizations)
4. Location (if mentioned)
5. Event type (meeting, filing, hearing, deadline, etc.)

Document text:
{text}

Return a JSON array of events, each with:
- event_name: string
- event_date: ISO date string or null
- participants: array of strings
- location: string or null
- event_type: string
- description: string
- confidence: float (0-1)

Return only valid JSON, no other text."""
        
        try:
            response = self.llm_client.chat.completions.create(
                model=settings.rag_model,
                messages=[
                    {"role": "system", "content": "You are an expert at extracting events from legal documents. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            
            import json
            result = json.loads(response.choices[0].message.content)
            
            # Parse events
            events = result.get('events', []) if isinstance(result, dict) else result if isinstance(result, list) else []
            
            extracted = []
            for event_data in events:
                if event_data.get('confidence', 0) >= settings.event_min_confidence:
                    extracted.append({
                        'event_name': event_data.get('event_name', ''),
                        'event_date': self._parse_date(event_data.get('event_date')),
                        'event_datetime': None,
                        'participants': event_data.get('participants', []),
                        'location': event_data.get('location'),
                        'event_type': event_data.get('event_type', 'other'),
                        'description': event_data.get('description', ''),
                        'confidence': event_data.get('confidence', 0.7),
                        'source_document_id': str(document.id)
                    })
            
            return extracted
        
        except Exception as e:
            print(f"Error extracting events with LLM: {str(e)}")
            return self._extract_with_patterns(document)
    
    def _extract_with_patterns(self, document: Document) -> List[Dict]:
        """Extract events using pattern matching."""
        text = document.extracted_text
        events = []
        
        # Extract dates
        date_patterns = [
            r'\b(\d{4}-\d{2}-\d{2})\b',  # ISO format
            r'\b(\d{1,2}/\d{1,2}/\d{4})\b',  # US format
            r'\b([A-Z][a-z]+ \d{1,2}, \d{4})\b',  # "January 15, 2024"
        ]
        
        dates_found = []
        for pattern in date_patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                date_str = match.group(1)
                parsed_date = self._parse_date(date_str)
                if parsed_date:
                    dates_found.append({
                        'date': parsed_date,
                        'position': match.start(),
                        'text': match.group(0)
                    })
        
        # Extract event-like phrases near dates
        event_keywords = [
            'hearing', 'trial', 'filing', 'deadline', 'meeting', 'conference',
            'deposition', 'discovery', 'motion', 'order', 'judgment', 'settlement',
            'mediation', 'arbitration', 'appeal', 'submission', 'response'
        ]
        
        for date_info in dates_found:
            # Look for event keywords near the date
            start_pos = max(0, date_info['position'] - 200)
            end_pos = min(len(text), date_info['position'] + 200)
            context = text[start_pos:end_pos]
            
            for keyword in event_keywords:
                if keyword.lower() in context.lower():
                    # Extract sentence or phrase
                    sentence_start = text.rfind('.', 0, date_info['position']) + 1
                    sentence_end = text.find('.', date_info['position'])
                    if sentence_end == -1:
                        sentence_end = min(len(text), date_info['position'] + 500)
                    
                    sentence = text[sentence_start:sentence_end].strip()
                    
                    events.append({
                        'event_name': f"{keyword.capitalize()} on {date_info['text']}",
                        'event_date': date_info['date'],
                        'event_datetime': None,
                        'participants': [],
                        'location': None,
                        'event_type': keyword,
                        'description': sentence[:500],
                        'confidence': 0.6,
                        'source_document_id': str(document.id)
                    })
                    break
        
        return events
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[date]:
        """Parse date string to date object."""
        if not date_str:
            return None
        
        for fmt in settings.event_date_formats:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
        
        # Try ISO format
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
        except:
            pass
        
        return None
    
    def save_events(
        self,
        events: List[Dict],
        document_id: str
    ) -> List[Event]:
        """
        Save extracted events to database.
        
        Returns:
            List of saved Event objects
        """
        saved_events = []
        
        for event_data in events:
            # Check if event already exists (by description and date)
            existing = self.db.query(Event).filter(
                Event.source_document_id == document_id,
                Event.event_date == event_data.get('event_date'),
                Event.description == event_data.get('description', '')[:500]
            ).first()
            
            if existing:
                continue
            
            # Create event
            event = Event(
                id=uuid.uuid4(),
                event_type=event_data.get('event_type', 'other'),
                event_name=event_data.get('event_name', ''),
                description=event_data.get('description', ''),
                event_date=event_data.get('event_date'),
                event_datetime=event_data.get('event_datetime'),
                date_confidence='exact' if event_data.get('event_date') else 'unknown',
                location_text=event_data.get('location'),
                participants=event_data.get('participants', []),
                attributes={
                    'confidence': event_data.get('confidence', 0.7),
                    'extraction_method': 'llm' if self.llm_client else 'pattern'
                },
                confidence_score=event_data.get('confidence', 0.7),
                source_document_id=document_id,
                extraction_method='llm' if self.llm_client else 'pattern',
                is_verified=False
            )
            
            self.db.add(event)
            saved_events.append(event)
        
        self.db.commit()
        return saved_events
    
    def _format_event_for_response(self, event: Event) -> Dict:
        """Format event for API response."""
        return {
            'id': str(event.id),
            'event_type': event.event_type,
            'event_name': event.event_name,
            'description': event.description,
            'event_date': event.event_date.isoformat() if event.event_date else None,
            'participants': event.participants or [],
            'location': event.location_text,
            'confidence_score': float(event.confidence_score) if event.confidence_score else None
        }

