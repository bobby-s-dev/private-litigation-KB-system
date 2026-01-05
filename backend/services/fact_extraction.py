"""Fact extraction service for extracting facts with event dates and tags from documents."""
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from datetime import datetime, date
import json
import re

from openai import OpenAI, AzureOpenAI
from models import Document
from config import settings


class FactExtractionService:
    """Service for extracting facts with event dates and tags from documents."""
    
    def __init__(self, db: Session):
        self.db = db
        
        # Initialize LLM client
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
    
    def extract_facts_from_document(
        self,
        document_id: str,
        use_llm: bool = True
    ) -> List[Dict]:
        """
        Extract facts from a document with event dates and tags.
        
        Args:
            document_id: Document ID
            use_llm: Use LLM for extraction (more accurate but slower)
        
        Returns:
            List of extracted facts with event_date, fact, and tags
        """
        document = self.db.query(Document).filter(Document.id == document_id).first()
        if not document or not document.extracted_text:
            return []
        
        if use_llm and self.llm_client:
            return self._extract_with_llm(document)
        else:
            return self._extract_with_patterns(document)
    
    def _extract_with_llm(self, document: Document) -> List[Dict]:
        """Extract facts using LLM."""
        if not self.llm_client:
            return self._extract_with_patterns(document)
        
        # Prepare text (limit length for LLM)
        text = document.extracted_text[:15000]  # Limit for LLM context
        
        prompt = f"""Extract important facts from the following legal document.
For each fact, identify:
1. The fact itself (a clear, factual statement)
2. Event date (if the fact relates to a specific date or event)
3. Appropriate tags (categorize the fact - e.g., "legal_proceeding", "deadline", "communication", "financial", "medical", "contract", "evidence", "witness", "expert", "discovery", "motion", "hearing", "settlement", etc.)

Document text:
{text}

Return a JSON object with a "facts" array. Each fact should have:
- fact: string (the factual statement)
- event_date: ISO date string (YYYY-MM-DD) or null if no specific date
- tags: array of strings (appropriate tags/categories for this fact)
- confidence: float (0-1, confidence in the fact extraction)
- source_text: string (brief excerpt from document showing where this fact came from)

Focus on:
- Dates and deadlines
- Legal proceedings and events
- Key statements and claims
- Important relationships or interactions
- Financial information
- Medical information
- Contract terms
- Evidence mentioned
- Witness or expert statements

Return only valid JSON, no other text. Use this format:
{{
  "facts": [
    {{
      "fact": "string",
      "event_date": "YYYY-MM-DD or null",
      "tags": ["tag1", "tag2"],
      "confidence": 0.85,
      "source_text": "excerpt from document"
    }}
  ]
}}"""
        
        try:
            response = self.llm_client.chat.completions.create(
                model=settings.rag_model or "gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert at extracting facts from legal documents. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            
            # Parse facts
            facts = result.get('facts', []) if isinstance(result, dict) else []
            
            extracted = []
            fact_id = 1
            for fact_data in facts:
                confidence = fact_data.get('confidence', 0.7)
                if confidence >= 0.5:  # Minimum confidence threshold
                    event_date = self._parse_date(fact_data.get('event_date'))
                    
                    # Ensure tags are appropriate and create new ones if needed
                    tags = self._process_tags(fact_data.get('tags', []))
                    
                    extracted.append({
                        'id': str(fact_id),
                        'fact': fact_data.get('fact', ''),
                        'event_date': event_date.isoformat() if event_date else None,
                        'tags': tags,
                        'confidence': confidence,
                        'source_text': fact_data.get('source_text', ''),
                        'page_number': None  # Could be extracted if document has page info
                    })
                    fact_id += 1
            
            return extracted
        
        except Exception as e:
            print(f"Error extracting facts with LLM: {str(e)}")
            return self._extract_with_patterns(document)
    
    def _extract_with_patterns(self, document: Document) -> List[Dict]:
        """Extract facts using pattern matching (fallback)."""
        text = document.extracted_text
        facts = []
        
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
        
        # Extract fact-like statements near dates
        fact_id = 1
        for date_info in dates_found[:10]:  # Limit to 10 date-based facts
            # Extract context around the date
            start_pos = max(0, date_info['position'] - 300)
            end_pos = min(len(text), date_info['position'] + 300)
            context = text[start_pos:end_pos]
            
            # Try to extract a sentence containing the date
            sentence_start = text.rfind('.', 0, date_info['position']) + 1
            sentence_end = text.find('.', date_info['position'])
            if sentence_end == -1:
                sentence_end = min(len(text), date_info['position'] + 500)
            
            sentence = text[sentence_start:sentence_end].strip()
            
            # Determine tags based on keywords
            tags = self._infer_tags_from_text(sentence)
            
            facts.append({
                'id': str(fact_id),
                'fact': f"Document references date {date_info['text']}: {sentence[:200]}",
                'event_date': date_info['date'].isoformat(),
                'tags': tags,
                'confidence': 0.6,
                'source_text': sentence[:300],
                'page_number': None
            })
            fact_id += 1
        
        return facts
    
    def _process_tags(self, tags: List[str]) -> List[str]:
        """
        Process and normalize tags. Create appropriate tags if needed.
        
        Args:
            tags: List of tag strings
        
        Returns:
            Normalized list of tags
        """
        if not tags:
            return []
        
        # Normalize tags
        normalized_tags = []
        for tag in tags:
            if not tag:
                continue
            
            # Normalize: lowercase, replace spaces with underscores
            normalized = tag.lower().strip().replace(' ', '_')
            
            # Common tag mappings
            tag_mappings = {
                'legal': 'legal_proceeding',
                'court': 'legal_proceeding',
                'lawsuit': 'legal_proceeding',
                'case': 'legal_proceeding',
                'trial': 'legal_proceeding',
                'hearing': 'legal_proceeding',
                'motion': 'legal_proceeding',
                'filing': 'legal_proceeding',
                'deadline': 'deadline',
                'due_date': 'deadline',
                'due': 'deadline',
                'email': 'communication',
                'letter': 'communication',
                'correspondence': 'communication',
                'meeting': 'communication',
                'call': 'communication',
                'money': 'financial',
                'payment': 'financial',
                'cost': 'financial',
                'expense': 'financial',
                'medical': 'medical',
                'health': 'medical',
                'treatment': 'medical',
                'diagnosis': 'medical',
                'contract': 'contract',
                'agreement': 'contract',
                'evidence': 'evidence',
                'document': 'evidence',
                'witness': 'witness',
                'expert': 'expert',
                'discovery': 'discovery',
                'deposition': 'discovery',
                'settlement': 'settlement',
                'mediation': 'settlement',
            }
            
            # Use mapping if available, otherwise use normalized tag
            final_tag = tag_mappings.get(normalized, normalized)
            
            if final_tag not in normalized_tags:
                normalized_tags.append(final_tag)
        
        return normalized_tags
    
    def _infer_tags_from_text(self, text: str) -> List[str]:
        """Infer tags from text content."""
        text_lower = text.lower()
        tags = []
        
        # Legal proceeding keywords
        if any(kw in text_lower for kw in ['hearing', 'trial', 'court', 'judge', 'motion', 'filing', 'lawsuit', 'case']):
            tags.append('legal_proceeding')
        
        # Deadline keywords
        if any(kw in text_lower for kw in ['deadline', 'due date', 'due by', 'must be', 'required by']):
            tags.append('deadline')
        
        # Communication keywords
        if any(kw in text_lower for kw in ['email', 'letter', 'correspondence', 'meeting', 'call', 'conference']):
            tags.append('communication')
        
        # Financial keywords
        if any(kw in text_lower for kw in ['payment', 'cost', 'expense', 'money', 'dollar', 'fee', 'charge']):
            tags.append('financial')
        
        # Medical keywords
        if any(kw in text_lower for kw in ['medical', 'treatment', 'diagnosis', 'doctor', 'hospital', 'health']):
            tags.append('medical')
        
        # Contract keywords
        if any(kw in text_lower for kw in ['contract', 'agreement', 'terms', 'clause']):
            tags.append('contract')
        
        # Evidence keywords
        if any(kw in text_lower for kw in ['evidence', 'document', 'exhibit', 'record']):
            tags.append('evidence')
        
        # Witness keywords
        if any(kw in text_lower for kw in ['witness', 'testimony', 'testify']):
            tags.append('witness')
        
        # Expert keywords
        if any(kw in text_lower for kw in ['expert', 'expertise', 'specialist']):
            tags.append('expert')
        
        # Discovery keywords
        if any(kw in text_lower for kw in ['discovery', 'deposition', 'interrogatory']):
            tags.append('discovery')
        
        # Settlement keywords
        if any(kw in text_lower for kw in ['settlement', 'mediation', 'arbitration']):
            tags.append('settlement')
        
        return tags if tags else ['general']
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[date]:
        """Parse date string to date object."""
        if not date_str:
            return None
        
        # Try common date formats
        date_formats = [
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
            "%d %b %Y",
        ]
        
        for fmt in date_formats:
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

