# Embedding & Qdrant Indexing Implementation

## Overview

Complete embedding and Qdrant indexing system with chunking strategies, embedding generation, vector storage, reindexing, and version management.

## Key Features

### 1. Chunking Strategies

Multiple chunking strategies for different document types:

#### Sentence-Based Chunking (Default)
- Splits text by sentence boundaries
- Respects size limits and overlap
- Handles long sentences gracefully
- Best for: General documents, narrative text

#### Paragraph-Based Chunking
- Splits by paragraph boundaries (double newlines)
- Preserves document structure
- Best for: Structured documents, reports

#### Sliding Window Chunking
- Fixed-size chunks with overlap
- Configurable window size and overlap
- Best for: Code, technical documents

#### Semantic Chunking (Placeholder)
- Future: Uses embeddings to find semantic boundaries
- Currently falls back to sentence-based
- Best for: Documents with clear semantic sections

### 2. Embedding Service

Supports multiple embedding providers:

#### OpenAI Embeddings
- Models: `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002`
- Auto-detects embedding dimensions
- Batch processing support

#### Azure OpenAI Embeddings
- Compatible with Azure OpenAI endpoints
- Configurable API version
- Same models as OpenAI

#### Local Embeddings (Future)
- Support for local embedding models
- Hugging Face integration ready

### 3. Qdrant Integration

#### Collection Management
- Automatic collection creation
- Model-based collection naming (for versioning)
- Vector size validation
- Distance metrics: COSINE, EUCLID, DOT

#### Point Operations
- Upsert points with metadata
- Delete by point ID
- Delete by filter (document_id, matter_id, etc.)
- Batch operations

#### Search Capabilities
- Semantic similarity search
- Filter by matter, document type, etc.
- Configurable result limits and score thresholds

### 4. Indexing Service

#### Document Indexing
- Automatic chunking
- Batch embedding generation
- Qdrant point creation
- Metadata storage in PostgreSQL

#### Auto-Indexing on Ingestion
- Configurable auto-indexing when documents are ingested
- Non-blocking (doesn't fail ingestion if indexing fails)
- Background task support

#### Batch Indexing
- Process multiple documents
- Progress tracking
- Error handling per document

### 5. Reindexing Service

#### Model Migration
- Reindex all documents with old model
- Migrate to new embedding model
- Preserve metadata

#### Selective Reindexing
- By matter: Reindex all documents in a matter
- By document type: Reindex all PDFs, DOCX, etc.
- By document: Reindex specific document

#### Version Updates
- Handle document version changes
- Delete old version embeddings
- Index new version automatically

#### Cleanup
- Remove orphaned embeddings
- Clean up non-current version embeddings
- Maintain data consistency

## Configuration

### Qdrant Settings

```python
qdrant_url: str = "http://localhost:6333"
qdrant_api_key: Optional[str] = None
qdrant_timeout: int = 30
```

### Embedding Settings

```python
embedding_provider: str = "openai"  # openai, azure, local
embedding_model: str = "text-embedding-3-large"
embedding_dimension: int = 3072  # Auto-detected for OpenAI
openai_api_key: Optional[str] = None
openai_base_url: Optional[str] = None
```

### Chunking Settings

```python
chunking_strategy: str = "sentence"  # sentence, paragraph, sliding_window, semantic
chunk_size: int = 1000  # Characters per chunk
chunk_overlap: int = 200  # Overlap between chunks
min_chunk_size: int = 100  # Minimum chunk size
max_chunk_size: int = 2000  # Maximum chunk size
respect_sentence_boundaries: bool = True
respect_paragraph_boundaries: bool = True
```

### Indexing Settings

```python
auto_index_on_ingestion: bool = True
batch_indexing_size: int = 100  # Chunks per batch
indexing_timeout: int = 300  # Seconds
```

## API Endpoints

### Indexing

#### Index Document
```http
POST /api/embeddings/index/{document_id}?force_reindex=false&background=false
```
Index a single document.

#### Index Batch
```http
POST /api/embeddings/index/batch?force_reindex=false&background=false
Body: ["doc_id_1", "doc_id_2", ...]
```
Index multiple documents.

#### Delete Index
```http
DELETE /api/embeddings/index/{document_id}
```
Delete all embeddings for a document.

### Reindexing

#### Reindex by Model
```http
POST /api/embeddings/reindex/model?old_model=text-embedding-ada-002&new_model=text-embedding-3-large
```
Reindex all documents with a specific model.

#### Reindex by Matter
```http
POST /api/embeddings/reindex/matter/{matter_id}?force_reindex=true
```
Reindex all documents in a matter.

#### Reindex by Type
```http
POST /api/embeddings/reindex/type/{document_type}?force_reindex=true
```
Reindex all documents of a type.

#### Handle Version Update
```http
POST /api/embeddings/reindex/version-update?old_document_id={old_id}&new_document_id={new_id}
```
Update embeddings when document version changes.

#### Cleanup Orphaned
```http
POST /api/embeddings/cleanup/orphaned
```
Remove embeddings for deleted/non-current documents.

### Search & Management

#### Semantic Search
```http
POST /api/embeddings/search?query_text={query}&limit=10&score_threshold=0.7&matter_id={id}
```
Search documents using semantic similarity.

#### Get Statistics
```http
GET /api/embeddings/statistics
```
Get indexing statistics.

#### List Collections
```http
GET /api/embeddings/collections
```
List all Qdrant collections.

#### Get Collection Info
```http
GET /api/embeddings/collections/{collection_name}
```
Get information about a collection.

#### Preview Chunking
```http
GET /api/embeddings/chunking/preview?text={text}&strategy=sentence&chunk_size=1000
```
Preview how text would be chunked.

## Usage Examples

### Python Client

```python
from services.indexing import IndexingService
from services.reindexing import ReindexingService
from services.qdrant_client import QdrantService
from services.embedding import EmbeddingService

# Index a document
indexing_service = IndexingService(db)
result = indexing_service.index_document(document_id)
print(f"Indexed {result['chunks_indexed']} chunks")

# Reindex by matter
reindexing_service = ReindexingService(db)
result = reindexing_service.reindex_by_matter(matter_id)
print(f"Reindexed {result['reindexing_results']['successful']} documents")

# Search
embedding_service = EmbeddingService()
qdrant_service = QdrantService()

query_embedding = embedding_service.generate_embedding("contract terms")
results = qdrant_service.search(
    collection_name="documents_text_embedding_3_large",
    query_vector=query_embedding,
    limit=10
)
```

### cURL Examples

```bash
# Index a document
curl -X POST "http://localhost:8000/api/embeddings/index/{doc_id}"

# Search
curl -X POST "http://localhost:8000/api/embeddings/search?query_text=contract%20terms&limit=10"

# Reindex matter
curl -X POST "http://localhost:8000/api/embeddings/reindex/matter/{matter_id}"

# Get statistics
curl "http://localhost:8000/api/embeddings/statistics"
```

## Database Schema

### EmbeddingsMetadata Table

Stores metadata about embeddings:
- Links to documents, entities, or events
- Qdrant collection and point ID references
- Chunk information (text, index, positions)
- Embedding model and dimensions
- Flexible metadata JSONB

## Collection Design

### Naming Convention

Collections are named based on embedding model:
- `documents_text_embedding_3_large`
- `documents_text_embedding_ada_002`

This allows:
- Multiple models to coexist
- Easy model migration
- Model-specific collections

### Point Payload Structure

```json
{
  "document_id": "uuid",
  "matter_id": "uuid",
  "chunk_index": 0,
  "chunk_text": "text content...",
  "start_position": 0,
  "end_position": 1000,
  "document_type": "pdf",
  "file_name": "document.pdf",
  "title": "Document Title"
}
```

## Version Management

### Document Version Updates

When a document version changes:
1. Delete old version embeddings from Qdrant
2. Delete old version metadata from PostgreSQL
3. Index new version
4. Update references

### Model Migration

When changing embedding models:
1. Identify documents with old model
2. Reindex with new model
3. Old and new collections can coexist
4. Gradually migrate or delete old collection

## Performance Considerations

### Batch Processing
- Embeddings generated in batches (default 100)
- Qdrant points upserted in batches
- Database commits batched

### Background Processing
- Indexing can run in background
- Non-blocking for ingestion
- Progress tracking available

### Chunking Optimization
- Sentence boundaries respected
- Overlap minimized while maintaining context
- Long texts split intelligently

## Error Handling

- Indexing failures don't block ingestion
- Failed embeddings logged but don't stop batch
- Orphaned embeddings cleaned up automatically
- Collection validation prevents mismatches

## Future Enhancements

1. **Semantic Chunking**: Implement true semantic boundary detection
2. **Hybrid Search**: Combine vector and keyword search
3. **Multi-Modal Embeddings**: Support images, tables, etc.
4. **Local Models**: Hugging Face integration
5. **Embedding Caching**: Cache embeddings for duplicate chunks
6. **Incremental Indexing**: Only reindex changed chunks
7. **Collection Aliases**: Support collection aliasing for zero-downtime migration

## Dependencies

- `qdrant-client`: Qdrant Python client
- `openai`: OpenAI API client
- `numpy`: Numerical operations

## Setup

1. **Install Qdrant**:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

2. **Configure Environment**:
```bash
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=your_key
EMBEDDING_MODEL=text-embedding-3-large
```

3. **Index Documents**:
```python
# Auto-indexing on ingestion (if enabled)
# Or manually:
POST /api/embeddings/index/{document_id}
```

## Integration with Ingestion

The ingestion service automatically indexes documents if `auto_index_on_ingestion` is enabled. This ensures all ingested documents are immediately searchable via semantic similarity.

