# PostgreSQL Schema Design - Litigation Knowledge System

## Overview

This schema is designed to support a comprehensive litigation knowledge system that handles document ingestion, versioning, deduplication, entity extraction, event tracking, relationship mapping, and full audit trails.

## Schema Architecture

### Core Tables

#### 1. **matters** - Legal Matters Management
- Tracks all legal matters (state/federal/bankruptcy/business)
- Supports multiple jurisdictions and case numbers
- Status tracking (active, closed, on_hold, archived)
- Flexible metadata via JSONB

#### 2. **documents** - Document Storage
- Core document table with versioning support
- Supports multiple document types (PDF, DOCX, email, notes, financial records)
- Hash-based deduplication (SHA256 + MD5)
- Text extraction and processing status tracking
- Confidentiality levels and tagging
- Email-specific fields (sender, recipients, dates)
- Full-text search support via PostgreSQL tsvector

#### 3. **document_versions** - Version Control & Deduplication
- Tracks all versions of documents
- Similarity scoring for duplicate detection
- Change tracking (content vs metadata changes)
- Links to parent documents for version chains

### Entity & Relationship Management

#### 4. **entity_types** - Entity Type Catalog
- Predefined entity types (person, organization, location, etc.)
- Supports custom entity types
- Tracks extraction models used

#### 5. **entities** - Extracted Entities
- Normalized entity names with aliases
- Entity resolution/merging support
- Confidence scoring and verification
- Flexible attributes via JSONB

#### 6. **document_entities** - Document-Entity Links
- Many-to-many relationship
- Tracks mention positions and context
- Multiple occurrence counting
- Extraction method tracking

#### 7. **relationship_types** - Relationship Type Catalog
- Predefined relationship types
- Directional vs bidirectional relationships
- Inverse relationship support

#### 8. **relationships** - Entity Relationships
- Links entities with typed relationships
- Temporal relationships (start/end dates)
- Strength and confidence scoring
- Source document tracking for provenance

### Event Tracking

#### 9. **events** - Extracted Events
- Event extraction from documents
- Temporal information (exact dates, ranges, confidence)
- Location and participant tracking
- Flexible attributes via JSONB

#### 10. **document_events** - Document-Event Links
- Many-to-many relationship
- Tracks event mentions in documents

### Vector Embeddings

#### 11. **embeddings_metadata** - Embedding Metadata
- Stores metadata about embeddings (actual vectors in Qdrant)
- Links to documents, entities, or events
- Tracks embedding model and dimensions
- Chunk-level tracking for multi-chunk documents
- Qdrant collection and point ID references

### Audit & Provenance

#### 12. **users** - User Management
- User accounts for audit trails
- Role-based access (admin, attorney, paralegal, etc.)

#### 13. **audit_log** - Comprehensive Audit Trail
- Tracks all system actions (create, update, delete, view, etc.)
- Before/after state for updates
- User context (IP, user agent)
- Flexible metadata

## Key Design Features

### 1. **Deduplication Strategy**
- **File-level**: SHA256 hash comparison in `documents` table
- **Version tracking**: `document_versions` table tracks all versions
- **Similarity scoring**: Decimal field for similarity comparison
- **Unique constraint**: One document per hash per matter

### 2. **Versioning System**
- `is_current_version` flag for active documents
- `version_number` for sequential versioning
- `parent_document_id` for version chains
- `document_versions` table for historical tracking

### 3. **Entity Resolution**
- `resolved_entity_id` for entity merging
- `normalized_name` for canonical entity names
- `aliases` array for name variations
- Verification flags and notes

### 4. **Full-Text Search**
- PostgreSQL `tsvector` for document text
- Trigram indexes (pg_trgm) for fuzzy matching
- GIN indexes on arrays (tags, categories, aliases)

### 5. **Flexible Metadata**
- JSONB columns for extensible attributes
- GIN indexes on JSONB for efficient querying
- No schema changes needed for new attributes

### 6. **Performance Optimizations**
- Strategic indexes on foreign keys
- Composite indexes for common query patterns
- GIN indexes for array and JSONB columns
- Full-text search indexes

### 7. **Data Integrity**
- Foreign key constraints with appropriate CASCADE/SET NULL
- CHECK constraints for enumerated values
- Unique constraints to prevent duplicates
- NOT NULL constraints on required fields

### 8. **Audit Trail**
- Automatic `updated_at` timestamps via triggers
- Optional audit log triggers (commented out - enable as needed)
- Comprehensive action tracking
- Before/after state preservation

## Indexes Strategy

### Primary Indexes
- All primary keys (UUID)
- All foreign keys
- Hash fields (for deduplication lookups)

### Search Indexes
- Full-text search on document text
- Trigram indexes for fuzzy name matching
- GIN indexes on arrays and JSONB

### Composite Indexes
- Matter + status/type combinations
- Entity relationship lookups
- Resource-based audit log queries

## Extensions Used

1. **uuid-ossp**: UUID generation
2. **pg_trgm**: Trigram similarity for fuzzy text search
3. **btree_gin**: GIN indexes on standard data types

## Views

1. **current_documents**: Filter to only current document versions
2. **matter_document_stats**: Aggregated statistics per matter
3. **entity_occurrence_stats**: Entity mention counts across documents

## Initial Data

The schema includes seed data for:
- Common entity types (PERSON, ORGANIZATION, LOCATION, etc.)
- Common relationship types (EMPLOYED_BY, REPRESENTS, PARTY_TO, etc.)

## Usage Notes

1. **Qdrant Integration**: The `embeddings_metadata` table stores references to Qdrant points. Actual vectors are stored in Qdrant.

2. **Version Management**: When ingesting a new version:
   - Set `is_current_version = FALSE` on old version
   - Create new document with `is_current_version = TRUE`
   - Link via `parent_document_id`
   - Add entry to `document_versions`

3. **Entity Resolution**: When merging entities:
   - Set `resolved_entity_id` on duplicate entities
   - Update relationships to point to resolved entity
   - Consider updating document_entities links

4. **Audit Logging**: Enable audit triggers selectively based on performance needs. The function is provided but triggers are commented out.

5. **Text Extraction**: Store both `raw_text` (original) and `extracted_text` (cleaned/processed) for different use cases.

## Future Enhancements

Consider adding:
- Document classification/prediction tables
- Search query history
- User annotations/comments
- Document sharing/permissions
- Export/import job tracking
- Processing pipeline status

