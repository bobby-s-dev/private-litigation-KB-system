"""Security check service for document validation."""
from pathlib import Path
from typing import Dict, Any, List
import mimetypes
import hashlib

class SecurityCheckService:
    """Service for performing security checks on uploaded documents."""
    
    def __init__(self):
        self.max_file_size = 500 * 1024 * 1024  # 500 MB
        self.allowed_extensions = {
            '.pdf', '.docx', '.doc', '.msg', '.eml', '.txt', '.csv',
            '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'
        }
        self.blocked_mime_types = [
            'application/x-executable',
            'application/x-msdownload',
            'application/x-sharedlib',
        ]
    
    def check_document(self, file_path: Path, file_size: int) -> Dict[str, Any]:
        """
        Perform security checks on a document.
        
        Returns:
            Dict with check results including passed, warnings, and errors
        """
        result = {
            'passed': True,
            'warnings': [],
            'errors': [],
            'checks_performed': []
        }
        
        # Check file size
        if file_size > self.max_file_size:
            result['passed'] = False
            result['errors'].append(f"File size ({file_size / (1024*1024):.2f} MB) exceeds maximum allowed size")
        else:
            result['checks_performed'].append('file_size_check')
        
        # Check file extension
        ext = file_path.suffix.lower()
        if ext not in self.allowed_extensions:
            result['passed'] = False
            result['errors'].append(f"File extension '{ext}' is not allowed")
        else:
            result['checks_performed'].append('extension_check')
        
        # Check MIME type
        mime_type, _ = mimetypes.guess_type(str(file_path))
        if mime_type:
            if any(blocked in mime_type for blocked in self.blocked_mime_types):
                result['passed'] = False
                result['errors'].append(f"MIME type '{mime_type}' is blocked for security reasons")
            else:
                result['checks_performed'].append('mime_type_check')
        
        # Check for suspicious patterns in filename
        filename = file_path.name.lower()
        suspicious_patterns = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js']
        if any(pattern in filename for pattern in suspicious_patterns):
            result['warnings'].append("Filename contains potentially suspicious patterns")
            result['checks_performed'].append('filename_check')
        
        # Check file content (basic magic number check)
        try:
            with open(file_path, 'rb') as f:
                header = f.read(16)
                # Check for executable signatures
                if header.startswith(b'MZ') or header.startswith(b'\x7fELF'):
                    result['passed'] = False
                    result['errors'].append("File appears to be an executable, which is not allowed")
                else:
                    result['checks_performed'].append('content_check')
        except Exception as e:
            result['warnings'].append(f"Could not perform content check: {str(e)}")
        
        return result

