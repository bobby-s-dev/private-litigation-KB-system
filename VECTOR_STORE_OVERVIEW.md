# Vector Store & Retrieval System Overview

## Architecture

This system uses **Qdrant** as the vector database for storing document embeddings and performing semantic similarity search.

---

## Components

### 1. **Qdrant Service** (`backend/services/qdrant_client.py`)

Core service for managing Qdrant operations:

- **Connection**: Connects to Qdrant using URL, API key, and timeout settings
- **Collection Management**: 
  - Creates collections automatically with proper vector dimensions
  - Collections named by embedding model (e.g., `documents_text_embedding_3_large`)
  - Distance metrics: COSINE (default), EUCLID, DOT
- **Operations**:
  - `upsert_points()` - Store/update vectors with metadata
  - `search()` - Semantic similarity search with filters
  - `delete_points()` - Delete by point IDs
  - `delete_points_by_filter()` - Delete by metadata filters
  - `scroll_points()` - Browse collection contents
  - `get_collection_info()` - Get collection statistics

### 2. **Embedding Service** (`backend/services/embedding.py`)

Generates vector embeddings from text:

- **Providers**: OpenAI, Azure OpenAI (local embeddings planned)
- **Models**: `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002`
- **Features**:
  - Auto-detects embedding dimensions
  - Batch processing support
  - Single and batch embedding generation

### 3. **Indexing Service** (`backend/services/indexing.py`)

Handles document indexing pipeline:

1. **Chunking**: Splits documents into chunks using configurable strategies
2. **Embedding**: Generates embeddings for each chunk
3. **Storage**: Stores vectors in Qdrant with rich metadata
4. **Metadata**: Tracks embeddings in PostgreSQL `embeddings_metadata` table

**Key Methods**:
- `index_document()` - Index a single document
- `index_batch()` - Index multiple documents
- `delete_document_index()` - Remove all embeddings for a document
- `reindex_document()` - Force reindex

**Metadata Stored in Qdrant**:
- `document_id` - Reference to document
- `matter_id` - Case/matter reference
- `chunk_index` - Position in document
- `chunk_text` - The actual text chunk
- `start_position` / `end_position` - Character positions
- `document_type` - Type of document
- `file_name` - Original filename
- `title` - Document title

### 4. **RAG Service** (`backend/services/rag.py`)

Retrieval Augmented Generation pipeline:

**Process**:
1. Generate embedding for user question
2. Search Qdrant for similar chunks (with optional filters)
3. Retrieve top-k chunks based on similarity score
4. Build context from retrieved chunks
5. Generate answer using LLM with context
6. Return answer with citations

**Features**:
- Filtering by `matter_id` or `document_ids`
- Configurable `top_k` and `score_threshold`
- Citation tracking with document references
- Confidence scoring based on retrieval quality

---

## Retrieval Flow

```
User Question
    ↓
Generate Query Embedding (EmbeddingService)
    ↓
Search Qdrant (QdrantService.search())
    ├─ Filter by matter_id (optional)
    ├─ Filter by document_ids (optional)
    ├─ Filter by document_type (optional)
    └─ Return top-k similar chunks
    ↓
Retrieve Chunk Metadata
    ├─ Document info from PostgreSQL
    ├─ Chunk text and positions
    └─ Similarity scores
    ↓
Build Context for LLM
    ↓
Generate Answer (OpenAI/Azure)
    ↓
Return Answer + Citations
```

---

## Configuration

**Settings** (`backend/config.py`):

```python
# Qdrant
qdrant_url: str = "http://localhost:6333"
qdrant_api_key: Optional[str] = None
qdrant_timeout: int = 30

# Embeddings
embedding_provider: str = "openai"  # openai, azure, local
embedding_model: str = "text-embedding-3-large"
embedding_dimension: int = 3072  # Auto-detected for OpenAI

# Chunking
chunking_strategy: str = "sentence"  # sentence, paragraph, sliding_window, semantic
chunk_size: int = 1000
chunk_overlap: int = 200

# RAG
rag_top_k: int = 5  # Number of chunks to retrieve
rag_score_threshold: float = 0.7  # Minimum similarity score
rag_model: str = "gpt-4o-mini"
```

---

## API Endpoints

### Indexing

- `POST /api/embeddings/index/{document_id}` - Index a document
- `POST /api/embeddings/index/batch` - Index multiple documents
- `DELETE /api/embeddings/index/{document_id}` - Delete document index

### Search

- `POST /api/embeddings/search` - Direct semantic search
  - Query: `query_text`, `limit`, `score_threshold`, `matter_id`, `document_type`
  - Returns: List of similar chunks with scores

### RAG

- `POST /api/rag/query` - RAG query with answer generation
  - Query: `question`, `matter_id`, `document_ids`, `top_k`, `score_threshold`
  - Returns: Answer, citations, confidence score

### Collection Management

- `GET /api/embeddings/collections` - List all collections
- `GET /api/embeddings/collections/{collection_name}` - Get collection info
- `GET /api/embeddings/statistics` - Get indexing statistics

### Reindexing

- `POST /api/embeddings/reindex/model` - Reindex by embedding model
- `POST /api/embeddings/reindex/matter/{matter_id}` - Reindex all documents in a matter
- `POST /api/embeddings/reindex/type/{document_type}` - Reindex by document type

---

## Database Schema

**EmbeddingsMetadata Table** (`backend/models.py`):

Stores metadata about embeddings (actual vectors in Qdrant):

- `id` - UUID primary key
- `document_id` - Foreign key to documents
- `qdrant_collection_name` - Qdrant collection name
- `qdrant_point_id` - Qdrant point UUID
- `embedding_model` - Model used (e.g., "text-embedding-3-large")
- `embedding_dimension` - Vector dimension
- `chunk_text` - The text that was embedded
- `chunk_index` - Position in document
- `chunk_start_position` / `chunk_end_position` - Character positions
- `metadata_json` - Additional metadata (JSONB)

---

## Collection Naming

Collections are automatically named based on the embedding model:

- Format: `documents_{model_name}`
- Example: `documents_text_embedding_3_large`
- Purpose: Enables versioning when switching embedding models

---

## Key Features

1. **Automatic Collection Creation**: Collections created on-demand with proper vector dimensions
2. **Metadata Filtering**: Filter searches by matter, document type, document ID
3. **Batch Processing**: Efficient batch embedding generation
4. **Citation Tracking**: Full citation support in RAG responses
5. **Reindexing Support**: Tools for reindexing when models change
6. **Orphan Cleanup**: Remove embeddings for deleted documents
7. **Version Management**: Support for multiple embedding model versions

---

## Usage Examples

### Index a Document
```python
POST /api/embeddings/index/{document_id}?force_reindex=false&background=false
```

### Search for Similar Chunks
```python
POST /api/embeddings/search?query_text=contract%20terms&limit=10&matter_id={matter_id}
```

### RAG Query
```python
POST /api/rag/query?question=What%20are%20the%20key%20contract%20terms?&matter_id={matter_id}&top_k=5
```

### Get Collection Info
```python
GET /api/embeddings/collections/documents_text_embedding_3_large
```

---

## File Locations

- **Qdrant Service**: `backend/services/qdrant_client.py`
- **Embedding Service**: `backend/services/embedding.py`
- **Indexing Service**: `backend/services/indexing.py`
- **RAG Service**: `backend/services/rag.py`
- **API Endpoints**: 
  - `backend/api/embeddings.py` (indexing/search)
  - `backend/api/rag.py` (RAG queries)
- **Configuration**: `backend/config.py`
- **Models**: `backend/models.py` (EmbeddingsMetadata)

