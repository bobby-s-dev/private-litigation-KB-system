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
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()

# Ensure directories exist
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.processed_dir, exist_ok=True)

