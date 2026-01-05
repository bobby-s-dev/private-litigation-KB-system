# RAG, Timeline & Link Analysis Implementation

## Overview

Complete implementation of RAG (Retrieval Augmented Generation) with citations, event extraction pipeline, timeline queries, and link analysis for the litigation knowledge system.

## Key Features

### 1. RAG Service with Citations

#### Query Processing
- Semantic search using Qdrant embeddings
- Retrieves top-k relevant chunks
- Generates answers using LLM (OpenAI/Azure)
- Includes source citations with document references

#### Citation Tracking
- Tracks which chunks were used in answer
- Links to source documents
- Shows chunk indices and similarity scores
- Provides document metadata (title, file name, type)

#### Features
- Filter by matter or specific documents
- Configurable top-k and score thresholds
- Confidence scoring based on retrieval quality
- Streaming support (placeholder)

### 2. Event Extraction Pipeline

#### Extraction Methods

**LLM-Based Extraction** (Default)
- Uses GPT models for accurate extraction
- Extracts: event name, date, participants, location, type
- Returns structured JSON with confidence scores
- Handles complex event descriptions

**Pattern-Based Extraction** (Fallback)
- Regex patterns for dates and event keywords
- Extracts events near date mentions
- Faster but less accurate
- Useful when LLM unavailable

#### Extracted Information
- Event name and description
- Dates (exact, approximate, ranges)
- Participants (people, organizations)
- Location
- Event type (hearing, filing, deadline, etc.)
- Confidence scores

#### Storage
- Saves to `events` table
- Links to source documents
- Tracks extraction method
- Prevents duplicates

### 3. Timeline Service

#### Chronological Queries
- Order events by date
- Filter by date ranges
- Support for exact dates and date ranges
- Handle missing dates gracefully

#### Filtering Options
- By matter
- By event types
- By participants (entities)
- By location
- Date range filtering

#### Timeline Features
- Get timeline for matter
- Get timeline for specific document
- Get upcoming events
- Timeline summary statistics

### 4. Link Analysis Service

#### Entity Connections
- Find all entities connected to a starting entity
- BFS traversal with configurable depth
- Filter by relationship types
- Returns graph structure (nodes and edges)

#### Document Connections
- Find documents connected via:
  - Shared entities
  - Shared events
- Returns connection types
- Useful for finding related documents

#### Event Connections
- Find events connected via:
  - Shared participants
  - Temporal proximity (within time window)
- Configurable proximity threshold

#### Matter Network Analysis
- Complete network for a matter
- Includes: entities, relationships, events, documents
- Statistics and full graph structure

## API Endpoints

### RAG Queries

#### Query with Citations
```http
POST /api/rag/query?question={question}&matter_id={id}&top_k=5
```
Perform RAG query and get answer with citations.

### Event Extraction

#### Extract Events from Document
```http
POST /api/rag/extract-events/{document_id}?use_llm=true&save=true
```
Extract events from a document using LLM or patterns.

### Timeline Queries

#### Get Timeline
```http
GET /api/rag/timeline?matter_id={id}&start_date=2024-01-01&end_date=2024-12-31
```
Get chronological timeline of events with filters.

#### Get Document Timeline
```http
GET /api/rag/timeline/document/{document_id}
```
Get timeline of events from a specific document.

#### Get Timeline Summary
```http
GET /api/rag/timeline/summary?matter_id={id}
```
Get summary statistics for timeline.

#### Get Upcoming Events
```http
GET /api/rag/timeline/upcoming?days_ahead=30&matter_id={id}
```
Get upcoming events within specified days.

### Link Analysis

#### Entity Connections
```http
GET /api/rag/links/entity/{entity_id}?max_depth=2&relationship_types=EMPLOYED_BY,REPRESENTS
```
Find all entities connected to a given entity.

#### Document Connections
```http
GET /api/rag/links/document/{document_id}?via_entities=true&via_events=true
```
Find documents connected to a given document.

#### Event Connections
```http
GET /api/rag/links/event/{event_id}?via_participants=true&via_temporal_proximity=true&days_threshold=30
```
Find events connected to a given event.

#### Matter Network
```http
GET /api/rag/links/matter/{matter_id}/network
```
Analyze complete network for a matter.

## Configuration

### RAG Settings

```python
rag_enabled: bool = True
rag_model: str = "gpt-4o-mini"
rag_temperature: float = 0.0
rag_max_tokens: int = 2000
rag_top_k: int = 5
rag_score_threshold: float = 0.7
rag_include_citations: bool = True
rag_max_context_length: int = 8000
```

### Event Extraction Settings

```python
event_extraction_enabled: bool = True
event_extraction_model: Optional[str] = None  # Uses RAG model if None
event_date_formats: List[str] = ["%Y-%m-%d", "%m/%d/%Y", "%B %d, %Y"]
event_min_confidence: float = 0.7
```

### Timeline Settings

```python
timeline_default_range_days: int = 365
timeline_max_events: int = 1000
```

### Link Analysis Settings

```python
link_analysis_max_depth: int = 3
link_analysis_max_nodes: int = 100
```

## Usage Examples

### Python Client

```python
from services.rag import RAGService
from services.timeline import TimelineService
from services.link_analysis import LinkAnalysisService
from services.event_extraction import EventExtractionService

# RAG Query
rag_service = RAGService(db)
result = rag_service.query(
    question="What are the key terms of the contract?",
    matter_id=matter_id,
    top_k=5
)
print(result['answer'])
for citation in result['citations']:
    print(f"Source: {citation['document_title']}")

# Extract Events
event_service = EventExtractionService(db)
events = event_service.extract_events_from_document(document_id, use_llm=True)
saved = event_service.save_events(events, document_id)

# Get Timeline
timeline_service = TimelineService(db)
timeline = timeline_service.get_timeline(
    matter_id=matter_id,
    start_date=date(2024, 1, 1),
    end_date=date(2024, 12, 31)
)

# Link Analysis
link_service = LinkAnalysisService(db)
graph = link_service.find_entity_connections(entity_id, max_depth=2)
network = link_service.analyze_matter_network(matter_id)
```

### cURL Examples

```bash
# RAG Query
curl -X POST "http://localhost:8000/api/rag/query?question=What%20are%20the%20contract%20terms?&matter_id={id}"

# Extract Events
curl -X POST "http://localhost:8000/api/rag/extract-events/{doc_id}?use_llm=true"

# Get Timeline
curl "http://localhost:8000/api/rag/timeline?matter_id={id}&start_date=2024-01-01"

# Entity Connections
curl "http://localhost:8000/api/rag/links/entity/{entity_id}?max_depth=2"

# Matter Network
curl "http://localhost:8000/api/rag/links/matter/{matter_id}/network"
```

## Response Formats

### RAG Query Response

```json
{
  "success": true,
  "answer": "The contract terms include...",
  "citations": [
    {
      "document_id": "uuid",
      "document_title": "Contract.pdf",
      "file_name": "Contract.pdf",
      "document_type": "pdf",
      "chunks": [
        {
          "chunk_index": 0,
          "score": 0.92,
          "text_preview": "..."
        }
      ]
    }
  ],
  "sources_used": 3,
  "chunks_used": 5,
  "confidence": 0.88,
  "query": "What are the contract terms?"
}
```

### Timeline Response

```json
{
  "timeline": [
    {
      "id": "uuid",
      "event_type": "hearing",
      "event_name": "Motion Hearing",
      "event_date": "2024-03-15",
      "location": "Courtroom 5",
      "participants": [...],
      "source_document": {
        "id": "uuid",
        "title": "Hearing Notice.pdf"
      }
    }
  ],
  "count": 10
}
```

### Link Analysis Response

```json
{
  "nodes": [
    {"id": "uuid", "name": "John Doe", "type": "entity", "is_root": true}
  ],
  "edges": [
    {
      "from": "uuid1",
      "to": "uuid2",
      "relationship_type": "EMPLOYED_BY",
      "strength": 0.95
    }
  ],
  "depth": 2
}
```

## Integration Points

### With Ingestion
- Events can be extracted during ingestion (future enhancement)
- Documents automatically indexed for RAG

### With Embeddings
- RAG uses Qdrant for semantic search
- Citations link to indexed chunks

### With Entities
- Link analysis uses entity relationships
- Timeline filters by participant entities

## Performance Considerations

1. **RAG Queries**: 
   - Embedding generation: ~100-200ms
   - Qdrant search: ~10-50ms
   - LLM generation: ~500-2000ms
   - Total: ~1-3 seconds

2. **Event Extraction**:
   - LLM extraction: ~2-5 seconds per document
   - Pattern extraction: ~100-500ms per document

3. **Timeline Queries**:
   - Simple queries: ~50-200ms
   - Complex filters: ~200-500ms

4. **Link Analysis**:
   - Entity connections: O(n) where n is number of relationships
   - Matter network: O(n+m) where n=entities, m=relationships

## Future Enhancements

1. **Streaming RAG**: Real-time answer generation
2. **Multi-hop Reasoning**: Chain multiple RAG queries
3. **Event Verification**: Manual verification workflow
4. **Advanced Link Analysis**: Graph algorithms, centrality measures
5. **Timeline Visualization**: Frontend timeline charts
6. **Event Clustering**: Group similar events
7. **Temporal Patterns**: Detect patterns in event sequences

## Dependencies

- `openai`: For LLM-based RAG and event extraction
- Existing: Qdrant, embeddings, database models

## Error Handling

- RAG failures return error messages
- Event extraction falls back to patterns if LLM fails
- Timeline handles missing dates gracefully
- Link analysis handles circular references

