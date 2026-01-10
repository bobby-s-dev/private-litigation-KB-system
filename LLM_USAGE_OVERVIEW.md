# LLM Usage in the System

## Overview

This system uses **OpenAI GPT models** (via OpenAI API or Azure OpenAI) for text generation tasks. The system supports both OpenAI and Azure OpenAI endpoints, configured via the `embedding_provider` setting.

---

## Primary LLM Model

**Default Model**: `gpt-4o-mini`

- **Configuration**: `settings.rag_model` in `backend/config.py`
- **Default Value**: `"gpt-4o-mini"`
- **Provider**: OpenAI or Azure OpenAI (configurable)

---

## Where LLMs Are Used

### 1. **RAG (Retrieval Augmented Generation)** 
**Service**: `backend/services/rag.py`

**Purpose**: Generate answers to questions based on retrieved document chunks

**Model Used**: `settings.rag_model` (default: `gpt-4o-mini`)

**Configuration**:
```python
rag_model: str = "gpt-4o-mini"
rag_temperature: float = 0.0  # Deterministic responses
rag_max_tokens: int = 2000
rag_max_context_length: int = 8000
```

**Usage**:
- Takes user questions
- Retrieves relevant document chunks from Qdrant
- Generates contextual answers using the LLM
- Returns answers with citations

**API Endpoint**: `POST /api/rag/query`

---

### 2. **Fact Extraction**
**Service**: `backend/services/fact_extraction.py`

**Purpose**: Extract important facts, dates, and tags from legal documents

**Model Used**: `settings.rag_model` (default: `gpt-4o-mini`)

**Fallback**: Pattern-based extraction (no LLM) if LLM unavailable

**Features**:
- Extracts facts with event dates
- Categorizes facts with tags
- Provides confidence scores
- Falls back to pattern matching if LLM fails

**Usage**:
```python
# Uses LLM if available
response = self.llm_client.chat.completions.create(
    model=settings.rag_model or "gpt-4o-mini",
    messages=[...],
    temperature=0.0,
    response_format={"type": "json_object"}
)
```

**API Endpoints**:
- `POST /api/documents/{document_id}/extract-facts`
- Used during document ingestion

---

### 3. **Event Extraction**
**Service**: `backend/services/event_extraction.py`

**Purpose**: Extract events, dates, participants, and locations from documents

**Model Used**: `settings.rag_model` (default: `gpt-4o-mini`)

**Fallback**: Pattern-based extraction (no LLM) if LLM unavailable

**Features**:
- Extracts events with dates
- Identifies participants and locations
- Categorizes event types
- Falls back to pattern matching if LLM fails

**Usage**:
```python
response = self.llm_client.chat.completions.create(
    model=settings.rag_model,
    messages=[...],
    temperature=0.0,
    response_format={"type": "json_object"}
)
```

**API Endpoint**: `POST /api/rag/extract-events/{document_id}`

---

## Provider Configuration

The system supports two providers:

### OpenAI (Default)
```python
embedding_provider: str = "openai"
openai_api_key: Optional[str] = None
openai_base_url: Optional[str] = None  # For custom endpoints
```

**Client Initialization**:
```python
from openai import OpenAI

self.llm_client = OpenAI(
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url
)
```

### Azure OpenAI
```python
embedding_provider: str = "azure"
azure_openai_endpoint: Optional[str] = None
azure_openai_api_key: Optional[str] = None
azure_openai_api_version: str = "2024-02-15-preview"
```

**Client Initialization**:
```python
from openai import AzureOpenAI

self.llm_client = AzureOpenAI(
    api_key=settings.azure_openai_api_key,
    azure_endpoint=settings.azure_openai_endpoint,
    api_version=settings.azure_openai_api_version
)
```

---

## Model Selection Logic

All services use the same model selection:

1. **Primary**: `settings.rag_model` (default: `"gpt-4o-mini"`)
2. **Fallback**: `"gpt-4o-mini"` (hardcoded fallback in fact extraction)
3. **Event Extraction**: Can use `settings.event_extraction_model` if set, otherwise uses `settings.rag_model`

**Code Pattern**:
```python
# RAG Service
model=settings.rag_model

# Fact Extraction
model=settings.rag_model or "gpt-4o-mini"

# Event Extraction
model=settings.rag_model  # or settings.event_extraction_model if set
```

---

## LLM Settings Summary

**Configuration** (`backend/config.py`):

```python
# RAG Settings
rag_enabled: bool = True
rag_model: str = "gpt-4o-mini"  # ← PRIMARY LLM MODEL
rag_temperature: float = 0.0  # Deterministic
rag_max_tokens: int = 2000
rag_top_k: int = 5
rag_score_threshold: float = 0.7
rag_include_citations: bool = True
rag_max_context_length: int = 8000

# Event Extraction
event_extraction_enabled: bool = True
event_extraction_model: Optional[str] = None  # Uses rag_model if None
```

---

## Temperature Settings

All LLM calls use **temperature = 0.0** for:
- **Deterministic responses**: Same input produces same output
- **Consistency**: Important for legal document processing
- **Reliability**: Reduces randomness in fact/event extraction

---

## Response Formats

### RAG Queries
- **Format**: Free-form text
- **Output**: Natural language answer with citations

### Fact Extraction
- **Format**: JSON object
- **Output**: Structured facts with dates, tags, confidence scores
- **Response Format**: `{"type": "json_object"}`

### Event Extraction
- **Format**: JSON object
- **Output**: Structured events with dates, participants, locations
- **Response Format**: `{"type": "json_object"}`

---

## Fallback Mechanisms

All services have fallback mechanisms:

1. **LLM Unavailable**: Falls back to pattern-based extraction
2. **LLM Error**: Catches exceptions and falls back to patterns
3. **No API Key**: Service initializes with `llm_client = None`, uses patterns

**Example** (Fact Extraction):
```python
if use_llm and self.llm_client:
    return self._extract_with_llm(document)
else:
    return self._extract_with_patterns(document)  # Fallback
```

---

## Embeddings vs LLMs

**Important Distinction**:

- **Embeddings**: `text-embedding-3-large` (for vector search)
  - Used for: Document chunking, similarity search
  - Purpose: Convert text to vectors for Qdrant storage
  
- **LLMs**: `gpt-4o-mini` (for text generation)
  - Used for: Answer generation, fact extraction, event extraction
  - Purpose: Generate text based on prompts

These are **separate models** with different purposes!

---

## File Locations

- **Configuration**: `backend/config.py` (lines 102-110)
- **RAG Service**: `backend/services/rag.py` (uses `settings.rag_model`)
- **Fact Extraction**: `backend/services/fact_extraction.py` (uses `settings.rag_model`)
- **Event Extraction**: `backend/services/event_extraction.py` (uses `settings.rag_model`)

---

## Summary

| Service | LLM Model | Purpose | Fallback |
|---------|-----------|---------|----------|
| RAG | `gpt-4o-mini` | Answer generation | None (required) |
| Fact Extraction | `gpt-4o-mini` | Extract facts from docs | Pattern matching |
| Event Extraction | `gpt-4o-mini` | Extract events from docs | Pattern matching |

**All services support**:
- OpenAI API
- Azure OpenAI
- Configurable via `embedding_provider` setting
- Temperature = 0.0 (deterministic)
- JSON response format for extraction tasks

