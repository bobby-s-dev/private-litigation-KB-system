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
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()

# Ensure directories exist
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.processed_dir, exist_ok=True)

