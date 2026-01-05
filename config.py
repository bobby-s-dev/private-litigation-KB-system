"""Configuration settings for the litigation knowledge system."""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings."""
    
    # Database
    database_url: str = "postgresql://user:password@localhost:5432/litigation_db"
    
    # File Storage
    storage_root: str = "./storage"
    upload_dir: str = "./storage/uploads"
    processed_dir: str = "./storage/processed"
    
    # Application
    app_name: str = "Litigation Knowledge System"
    debug: bool = True
    log_level: str = "INFO"
    
    # Processing
    max_file_size_mb: int = 500
    enable_ocr: bool = False
    ocr_language: str = "eng"
    
    # Similarity Thresholds
    exact_duplicate_threshold: float = 1.0
    near_duplicate_threshold: float = 0.95
    fuzzy_match_threshold: float = 0.85  # For fuzzy matching algorithms
    
    # Canonical Version Selection
    canonical_selection_enabled: bool = True
    canonical_prefer_latest: bool = True  # Prefer most recent version
    canonical_prefer_larger: bool = True  # Prefer larger file size (more complete)
    canonical_prefer_processed: bool = True  # Prefer successfully processed documents
    canonical_quality_weight: float = 0.4  # Weight for quality metrics
    canonical_recency_weight: float = 0.3  # Weight for recency
    canonical_completeness_weight: float = 0.3  # Weight for completeness
    
    # Diff/Merge Settings
    diff_context_lines: int = 3  # Lines of context around changes
    diff_max_changes: int = 1000  # Maximum changes to track
    enable_merge_artifacts: bool = True
    
    # Qdrant Settings
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: Optional[str] = None
    qdrant_timeout: int = 30
    
    # Embedding Settings
    embedding_provider: str = "openai"  # openai, azure, local
    embedding_model: str = "text-embedding-3-large"
    embedding_dimension: int = 3072  # Will be auto-detected for OpenAI
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    azure_openai_endpoint: Optional[str] = None
    azure_openai_api_key: Optional[str] = None
    azure_openai_api_version: str = "2024-02-15-preview"
    
    # Chunking Settings
    chunking_strategy: str = "sentence"  # sentence, paragraph, sliding_window, semantic
    chunk_size: int = 1000  # Characters per chunk
    chunk_overlap: int = 200  # Overlap between chunks
    min_chunk_size: int = 100  # Minimum chunk size
    max_chunk_size: int = 2000  # Maximum chunk size
    respect_sentence_boundaries: bool = True
    respect_paragraph_boundaries: bool = True
    
    # Indexing Settings
    auto_index_on_ingestion: bool = True
    batch_indexing_size: int = 100  # Number of chunks to process in batch
    indexing_timeout: int = 300  # Seconds
    
    # RAG Settings
    rag_enabled: bool = True
    rag_model: str = "gpt-4o-mini"  # LLM model for RAG
    rag_temperature: float = 0.0
    rag_max_tokens: int = 2000
    rag_top_k: int = 5  # Number of chunks to retrieve
    rag_score_threshold: float = 0.7  # Minimum similarity score
    rag_include_citations: bool = True
    rag_max_context_length: int = 8000  # Max context for LLM
    
    # Event Extraction Settings
    event_extraction_enabled: bool = True
    event_extraction_model: Optional[str] = None  # Use LLM if None
    event_date_formats: List[str] = ["%Y-%m-%d", "%m/%d/%Y", "%B %d, %Y"]
    event_min_confidence: float = 0.7
    
    # Timeline Settings
    timeline_default_range_days: int = 365
    timeline_max_events: int = 1000
    
    # Link Analysis Settings
    link_analysis_max_depth: int = 3
    link_analysis_max_nodes: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()

# Ensure directories exist
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.processed_dir, exist_ok=True)

