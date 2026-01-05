"""Hashing service for file deduplication."""
import hashlib
from pathlib import Path
from typing import Tuple


class HashingService:
    """Service for computing file hashes."""
    
    @staticmethod
    def compute_file_hashes(file_path: Path) -> Tuple[str, str]:
        """
        Compute SHA256 and MD5 hashes of a file.
        
        Returns:
            Tuple of (sha256_hash, md5_hash)
        """
        sha256_hash = hashlib.sha256()
        md5_hash = hashlib.md5()
        
        with open(file_path, 'rb') as f:
            # Read file in chunks to handle large files
            for chunk in iter(lambda: f.read(4096), b''):
                sha256_hash.update(chunk)
                md5_hash.update(chunk)
        
        return sha256_hash.hexdigest(), md5_hash.hexdigest()
    
    @staticmethod
    def compute_text_hash(text: str) -> str:
        """Compute SHA256 hash of text content."""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    @staticmethod
    def compute_bytes_hash(data: bytes) -> Tuple[str, str]:
        """Compute SHA256 and MD5 hashes of bytes."""
        sha256_hash = hashlib.sha256(data).hexdigest()
        md5_hash = hashlib.md5(data).hexdigest()
        return sha256_hash, md5_hash

