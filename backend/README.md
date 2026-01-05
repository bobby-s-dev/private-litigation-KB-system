# Litigation Knowledge System - Ingestion Service

A comprehensive document ingestion system for managing litigation documents with deduplication, versioning, and metadata extraction.

## Features

- **Multi-format Support**: PDF, DOCX, MSG, EML, TXT, CSV, and images (with optional OCR)
- **Deduplication**: Exact duplicate detection via hash comparison and near-duplicate detection via text similarity
- **Versioning**: Automatic version tracking with similarity scoring
- **Text Extraction**: Extracts text and structure from various document types
- **Metadata Extraction**: Stub implementation for entity, date, and topic extraction
- **Provenance Tracking**: Full audit trail with ingestion run IDs
- **File Storage**: Organized storage with matter-based directory structure

## Setup

### Prerequisites

- Python 3.9+
- PostgreSQL 12+
- Tesseract OCR (optional, for image OCR)

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Initialize database:
```bash
# Run the schema.sql against your PostgreSQL database
psql -U your_user -d your_database -f schema.sql
```

4. Run the application:
```bash
python main.py
# Or with uvicorn directly:
uvicorn main:app --reload
```

## API Endpoints

### Upload Single File
```http
POST /api/ingestion/upload
Content-Type: multipart/form-data

Parameters:
- matter_id: UUID of the matter
- file: File to upload
- document_type: Optional (pdf, docx, email, note, financial_record, other)
- tags: Optional list of tags
- categories: Optional list of categories
- user_id: Optional user ID for audit trail
```

### Upload Multiple Files
```http
POST /api/ingestion/upload-batch
Content-Type: multipart/form-data

Parameters:
- matter_id: UUID of the matter
- files: List of files to upload
- document_type: Optional
- tags: Optional
- categories: Optional
- user_id: Optional
```

### Import Folder
```http
POST /api/ingestion/import-folder

Body (JSON):
{
  "matter_id": "uuid",
  "folder_path": "/path/to/folder",
  "document_type": "optional",
  "tags": ["tag1", "tag2"],
  "categories": ["cat1"],
  "user_id": "optional",
  "recursive": true
}
```

### Get Ingestion Status
```http
GET /api/ingestion/status/{ingestion_run_id}
```

## Usage Examples

### Python Client Example

```python
import requests

# Upload a file
with open('document.pdf', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/api/ingestion/upload',
        files={'file': f},
        data={
            'matter_id': 'your-matter-uuid',
            'document_type': 'pdf',
            'tags': 'important,confidential'
        }
    )
    result = response.json()
    print(f"Document ID: {result['document_id']}")
    print(f"Is Duplicate: {result['is_duplicate']}")
```

### cURL Example

```bash
curl -X POST "http://localhost:8000/api/ingestion/upload" \
  -F "matter_id=your-matter-uuid" \
  -F "file=@document.pdf" \
  -F "document_type=pdf"
```

## Architecture

### Services

- **FileStorageService**: Manages file storage and organization
- **HashingService**: Computes SHA256 and MD5 hashes for deduplication
- **TextExtractionService**: Extracts text from various file formats
- **DuplicateDetectionService**: Detects exact and near-duplicates
- **VersionManagementService**: Manages document versioning
- **MetadataExtractionService**: Extracts metadata (stub implementation)
- **IngestionService**: Orchestrates the ingestion process

### Database Schema

The system uses PostgreSQL with the following key tables:
- `matters`: Legal matters
- `documents`: Document records with versioning
- `document_versions`: Version history
- `entities`: Extracted entities (future)
- `relationships`: Entity relationships (future)
- `events`: Extracted events (future)
- `audit_log`: Audit trail

## Configuration

Key configuration options in `config.py` or `.env`:

- `DATABASE_URL`: PostgreSQL connection string
- `STORAGE_ROOT`: Root directory for file storage
- `MAX_FILE_SIZE_MB`: Maximum file size (default: 500 MB)
- `ENABLE_OCR`: Enable OCR for images (default: False)
- `EXACT_DUPLICATE_THRESHOLD`: Hash match threshold (default: 1.0)
- `NEAR_DUPLICATE_THRESHOLD`: Text similarity threshold (default: 0.95)

## Response Format

### Successful Ingestion
```json
{
  "success": true,
  "document_id": "uuid",
  "status": "completed",
  "is_duplicate": false,
  "is_new_version": false,
  "version_number": 1,
  "ingestion_run_id": "uuid",
  "near_duplicates_found": 0
}
```

### Duplicate Detected
```json
{
  "success": true,
  "document_id": "existing-uuid",
  "status": "duplicate",
  "is_duplicate": true,
  "existing_document_id": "existing-uuid",
  "version_number": 1
}
```

## Future Enhancements

- Full NER implementation for entity extraction
- Topic modeling and classification
- Advanced relationship extraction
- Qdrant integration for vector search
- Timeline builder
- Contradiction detection
- Pattern analysis

## License

[Your License Here]

