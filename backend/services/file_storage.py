"""File storage and management service."""
import os
import shutil
from pathlib import Path
from typing import Optional
from config import settings


class FileStorageService:
    """Service for managing file storage."""
    
    def __init__(self):
        self.upload_dir = Path(settings.upload_dir)
        self.processed_dir = Path(settings.processed_dir)
        self.storage_root = Path(settings.storage_root)
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Ensure storage directories exist."""
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)
    
    def save_uploaded_file(self, file_content: bytes, filename: str, matter_id: str) -> Path:
        """Save uploaded file to upload directory."""
        matter_dir = self.upload_dir / matter_id
        matter_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = matter_dir / filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        return file_path
    
    def move_to_processed(self, source_path: Path, matter_id: str, document_id: str, filename: str) -> Path:
        """Move file from upload to processed directory."""
        matter_dir = self.processed_dir / matter_id
        matter_dir.mkdir(parents=True, exist_ok=True)
        
        # Use document_id in filename to avoid collisions
        dest_path = matter_dir / f"{document_id}_{filename}"
        
        shutil.move(str(source_path), str(dest_path))
        return dest_path
    
    def get_file_path(self, relative_path: str) -> Path:
        """Get absolute path from relative path."""
        return Path(settings.storage_root) / relative_path
    
    def delete_file(self, file_path: Path) -> bool:
        """Delete a file."""
        try:
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception:
            return False
    
    def get_file_size(self, file_path: Path) -> int:
        """Get file size in bytes."""
        return file_path.stat().st_size if file_path.exists() else 0

