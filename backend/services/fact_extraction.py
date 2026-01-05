"""Fact extraction service for extracting facts with event dates and tags from documents."""
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from datetime import datetime, date
import json
import re
import uuid

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
            document_id: Document ID (UUID string)
            use_llm: Use LLM for extraction (more accurate but slower)
        
        Returns:
            List of extracted facts with event_date, fact, and tags
        """
        try:
            # Convert string to UUID if needed
            if isinstance(document_id, str):
                doc_uuid = uuid.UUID(document_id)
            else:
                doc_uuid = document_id
        except (ValueError, AttributeError):
            # If conversion fails, try as string
            doc_uuid = document_id
        
        document = self.db.query(Document).filter(Document.id == doc_uuid).first()
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
        """Extract facts using pattern matching (fallback - no LLM required)."""
        text = document.extracted_text
        facts = []
        fact_id = 1
        
        # Extract dates with context
        date_patterns = [
            r'\b(\d{4}-\d{2}-\d{2})\b',  # ISO format
            r'\b(\d{1,2}/\d{1,2}/\d{4})\b',  # US format
            r'\b([A-Z][a-z]+ \d{1,2}, \d{4})\b',  # "January 15, 2024"
            r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b',  # "15 January 2024"
        ]
        
        dates_found = []
        for pattern in date_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
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
        for date_info in dates_found[:15]:  # Limit to 15 date-based facts
            # Extract context around the date
            sentence_start = max(0, text.rfind('.', 0, date_info['position']) + 1)
            sentence_end = text.find('.', date_info['position'])
            if sentence_end == -1:
                sentence_end = min(len(text), date_info['position'] + 500)
            
            sentence = text[sentence_start:sentence_end].strip()
            if len(sentence) < 20:  # Skip very short sentences
                continue
            
            # Determine tags based on keywords
            tags = self._infer_tags_from_text(sentence)
            
            # Create a fact statement
            fact_text = sentence[:200] if len(sentence) <= 200 else sentence[:197] + "..."
            
            facts.append({
                'id': str(fact_id),
                'fact': fact_text,
                'event_date': date_info['date'].isoformat(),
                'tags': tags,
                'confidence': 0.65,
                'source_text': sentence[:300],
                'page_number': None
            })
            fact_id += 1
        
        # Extract facts from key phrases and patterns (without dates)
        fact_patterns = [
            # Legal proceedings
            (r'(?:hearing|trial|motion|filing|deposition|discovery|settlement|mediation|arbitration)\s+(?:was|is|will be|scheduled|held|conducted|filed|submitted)', 'legal_proceeding'),
            # Deadlines
            (r'(?:deadline|due date|must be|required by|by)\s+[A-Z][a-z]+\s+\d{1,2}', 'deadline'),
            # Financial amounts
            (r'\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s+(?:was|is|paid|owed|due|received|charged)', 'financial'),
            # Medical information
            (r'(?:diagnosis|treatment|medical|doctor|hospital|patient|condition)\s+[a-z]+', 'medical'),
            # Contracts/Agreements
            (r'(?:contract|agreement|terms|clause|provision)\s+(?:was|is|states|requires)', 'contract'),
            # Evidence
            (r'(?:evidence|exhibit|document|record)\s+(?:was|is|shows|indicates)', 'evidence'),
            # Witness statements
            (r'(?:witness|testimony|testified|stated)\s+[a-z]+', 'witness'),
            # Expert statements
            (r'(?:expert|specialist|consultant)\s+(?:was|is|stated|concluded)', 'expert'),
        ]
        
        for pattern, default_tag in fact_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches[:5]:  # Limit to 5 per pattern
                start_pos = match.start()
                # Extract sentence
                sentence_start = max(0, text.rfind('.', 0, start_pos) + 1)
                sentence_end = text.find('.', start_pos)
                if sentence_end == -1:
                    sentence_end = min(len(text), start_pos + 300)
                
                sentence = text[sentence_start:sentence_end].strip()
                if len(sentence) < 30:
                    continue
                
                # Check if this fact is already captured (similar to existing)
                is_duplicate = False
                for existing_fact in facts:
                    if sentence[:100] in existing_fact.get('source_text', '')[:100]:
                        is_duplicate = True
                        break
                
                if is_duplicate:
                    continue
                
                # Extract date from sentence if present
                event_date = None
                for date_info in dates_found:
                    if date_info['position'] >= sentence_start and date_info['position'] <= sentence_end:
                        event_date = date_info['date'].isoformat()
                        break
                
                tags = self._infer_tags_from_text(sentence)
                if default_tag not in tags:
                    tags.append(default_tag)
                
                facts.append({
                    'id': str(fact_id),
                    'fact': sentence[:200] if len(sentence) <= 200 else sentence[:197] + "...",
                    'event_date': event_date,
                    'tags': tags,
                    'confidence': 0.6,
                    'source_text': sentence[:300],
                    'page_number': None
                })
                fact_id += 1
        
        # Extract entity-based facts (names, organizations mentioned)
        entity_facts = self._extract_entity_facts(text, fact_id)
        facts.extend(entity_facts)
        
        # Remove duplicates and limit total
        unique_facts = []
        seen_facts = set()
        for fact in facts[:30]:  # Limit to 30 total facts
            fact_key = fact['fact'][:100].lower()
            if fact_key not in seen_facts:
                seen_facts.add(fact_key)
                unique_facts.append(fact)
        
        return unique_facts
    
    def _extract_entity_facts(self, text: str, start_id: int) -> List[Dict]:
        """Extract facts related to entities (people, organizations) without LLM."""
        facts = []
        fact_id = start_id
        
        # Patterns for person names (capitalized words, typically 2-4 words)
        person_pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b'
        # Patterns for organizations (Inc, LLC, Corp, etc.)
        org_patterns = [
            r'\b([A-Z][a-zA-Z\s&]+(?:Inc|LLC|Corp|Corporation|Ltd|Company|Co\.|Associates|Group))\b',
            r'\b([A-Z][a-zA-Z\s&]+(?:Hospital|University|College|School|Foundation|Institute))\b',
        ]
        
        # Extract person names
        person_matches = list(re.finditer(person_pattern, text))
        # Filter out common false positives
        common_words = {'The', 'This', 'That', 'There', 'These', 'Those', 'When', 'Where', 'What', 'Which', 
                       'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 
                       'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday',
                       'Thursday', 'Friday', 'Saturday', 'Sunday'}
        
        person_names = []
        for match in person_matches:
            name = match.group(1).strip()
            words = name.split()
            # Filter: must be 2-4 words, first word not in common words, all words capitalized
            if (2 <= len(words) <= 4 and 
                words[0] not in common_words and 
                all(w[0].isupper() for w in words if w) and
                len(name) > 5):
                person_names.append({
                    'name': name,
                    'position': match.start(),
                    'context': text[max(0, match.start()-100):min(len(text), match.end()+100)]
                })
        
        # Extract organization names
        org_names = []
        for pattern in org_patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                org_names.append({
                    'name': match.group(1).strip(),
                    'position': match.start(),
                    'context': text[max(0, match.start()-100):min(len(text), match.end()+100)]
                })
        
        # Create facts for significant entity mentions
        all_entities = person_names[:10] + org_names[:10]  # Limit entities
        
        for entity in all_entities:
            # Extract sentence with entity
            sentence_start = max(0, text.rfind('.', 0, entity['position']) + 1)
            sentence_end = text.find('.', entity['position'])
            if sentence_end == -1:
                sentence_end = min(len(text), entity['position'] + 300)
            
            sentence = text[sentence_start:sentence_end].strip()
            if len(sentence) < 30:
                continue
            
            # Check for date in sentence
            event_date = None
            date_match = re.search(r'\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})\b', sentence)
            if date_match:
                parsed_date = self._parse_date(date_match.group(1))
                if parsed_date:
                    event_date = parsed_date.isoformat()
            
            # Determine entity type and tags
            if any(word in entity['name'] for word in ['Inc', 'LLC', 'Corp', 'Hospital', 'University']):
                tags = ['organization', 'general']
            else:
                tags = ['person', 'general']
            
            # Add context-specific tags
            context_tags = self._infer_tags_from_text(sentence)
            tags.extend([t for t in context_tags if t not in tags])
            
            facts.append({
                'id': str(fact_id),
                'fact': f"{entity['name']} mentioned: {sentence[:150] if len(sentence) > 150 else sentence}",
                'event_date': event_date,
                'tags': tags[:3],  # Limit to 3 tags
                'confidence': 0.55,
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

