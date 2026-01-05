-- ============================================================================
-- Litigation Knowledge System - PostgreSQL Schema
-- ============================================================================
-- This schema supports document ingestion, versioning, deduplication,
-- entity extraction, event tracking, relationship mapping, and audit trails
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text similarity searches
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For GIN indexes on arrays

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Matters: Legal matters (state/federal/bankruptcy/business)
CREATE TABLE matters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    matter_number VARCHAR(100) NOT NULL UNIQUE,
    matter_name VARCHAR(500) NOT NULL,
    matter_type VARCHAR(50) NOT NULL CHECK (matter_type IN ('state', 'federal', 'bankruptcy', 'business', 'other')),
    jurisdiction VARCHAR(200),
    court_name VARCHAR(300),
    case_number VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'on_hold', 'archived')),
    description TEXT,
    opened_date DATE,
    closed_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Documents: Core document table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('pdf', 'docx', 'email', 'note', 'financial_record', 'other')),
    title VARCHAR(500),
    file_name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,  -- Size in bytes
    mime_type VARCHAR(100),
    file_hash_sha256 VARCHAR(64),  -- For deduplication
    file_hash_md5 VARCHAR(32),
    
    -- Content extraction
    raw_text TEXT,
    extracted_text TEXT,  -- Cleaned/processed text
    text_length INTEGER,
    
    -- Metadata
    author VARCHAR(200),
    created_date TIMESTAMP WITH TIME ZONE,
    modified_date TIMESTAMP WITH TIME ZONE,
    received_date TIMESTAMP WITH TIME ZONE,  -- For emails
    sent_date TIMESTAMP WITH TIME ZONE,  -- For emails
    sender_email VARCHAR(255),
    recipient_emails TEXT[],  -- Array of email addresses
    
    -- Classification
    confidentiality_level VARCHAR(20) DEFAULT 'internal' CHECK (confidentiality_level IN ('public', 'internal', 'confidential', 'privileged', 'restricted')),
    tags TEXT[],
    categories TEXT[],
    
    -- Processing status
    processing_status VARCHAR(50) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'needs_review')),
    processing_error TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Versioning
    is_current_version BOOLEAN DEFAULT TRUE,
    version_number INTEGER DEFAULT 1,
    parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,  -- For version chains
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ingested_by UUID,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT unique_file_hash_per_matter UNIQUE (matter_id, file_hash_sha256)
);

-- Document Versions: Track document version history and deduplication
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    file_hash_md5 VARCHAR(32),
    file_path TEXT NOT NULL,
    file_size BIGINT,
    
    -- Version metadata
    change_type VARCHAR(50) CHECK (change_type IN ('initial', 'update', 'revision', 'correction', 'duplicate')),
    change_description TEXT,
    similarity_score DECIMAL(5,4),  -- Similarity to previous version (0-1)
    
    -- Content comparison
    text_diff_hash VARCHAR(64),  -- Hash of text differences
    content_changed BOOLEAN DEFAULT FALSE,
    metadata_changed BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Constraints
    CONSTRAINT unique_version_per_document UNIQUE (document_id, version_number)
);

-- Entity Types: Catalog of entity types
CREATE TABLE entity_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL CHECK (category IN ('person', 'organization', 'location', 'date', 'amount', 'document_reference', 'legal_concept', 'other')),
    description TEXT,
    extraction_model VARCHAR(100),  -- Which model extracted this type
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Entities: Extracted entities from documents
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type_id UUID NOT NULL REFERENCES entity_types(id) ON DELETE RESTRICT,
    normalized_name VARCHAR(500) NOT NULL,  -- Canonical name
    display_name VARCHAR(500),
    aliases TEXT[],  -- Alternative names/variations
    
    -- Entity attributes
    attributes JSONB DEFAULT '{}'::jsonb,  -- Flexible attributes (e.g., title, role, address)
    
    -- Classification
    confidence_score DECIMAL(5,4),  -- Extraction confidence (0-1)
    is_verified BOOLEAN DEFAULT FALSE,
    verification_notes TEXT,
    
    -- Resolution
    resolved_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,  -- For entity resolution/merging
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Indexes will be created separately
    CONSTRAINT unique_normalized_name_per_type UNIQUE (entity_type_id, normalized_name)
);

-- Document-Entity relationships: Many-to-many
CREATE TABLE document_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    
    -- Occurrence details
    mention_text TEXT,  -- Exact text as it appeared
    mention_count INTEGER DEFAULT 1,
    first_occurrence_position INTEGER,  -- Character position in document
    last_occurrence_position INTEGER,
    context_snippets TEXT[],  -- Array of context snippets around mentions
    
    -- Extraction metadata
    extraction_method VARCHAR(50),  -- 'ner', 'llm', 'manual', etc.
    confidence_score DECIMAL(5,4),
    extracted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_document_entity UNIQUE (document_id, entity_id)
);

-- Relationship Types: Catalog of relationship types
CREATE TABLE relationship_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_directional BOOLEAN DEFAULT TRUE,  -- Can relationship be reversed?
    inverse_type_id UUID REFERENCES relationship_types(id) ON DELETE SET NULL,
    category VARCHAR(50) CHECK (category IN ('legal', 'organizational', 'temporal', 'financial', 'geographic', 'other')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Relationships: Relationships between entities
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    relationship_type_id UUID NOT NULL REFERENCES relationship_types(id) ON DELETE RESTRICT,
    source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    
    -- Relationship attributes
    strength DECIMAL(5,4),  -- Relationship strength (0-1)
    confidence_score DECIMAL(5,4),
    attributes JSONB DEFAULT '{}'::jsonb,  -- Additional relationship data (dates, amounts, etc.)
    
    -- Provenance
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    extraction_method VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_notes TEXT,
    
    -- Temporal
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Constraints
    CONSTRAINT no_self_relationship CHECK (source_entity_id != target_entity_id),
    CONSTRAINT unique_relationship UNIQUE (relationship_type_id, source_entity_id, target_entity_id, start_date)
);

-- Events: Events extracted from documents
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_name VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Temporal
    event_date DATE,
    event_datetime TIMESTAMP WITH TIME ZONE,
    date_confidence VARCHAR(20) CHECK (date_confidence IN ('exact', 'approximate', 'range', 'unknown')),
    date_range_start DATE,
    date_range_end DATE,
    
    -- Location
    location_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    location_text VARCHAR(500),
    
    -- Participants (stored as JSONB for flexibility)
    participants JSONB DEFAULT '[]'::jsonb,  -- Array of {entity_id, role}
    
    -- Attributes
    attributes JSONB DEFAULT '{}'::jsonb,
    confidence_score DECIMAL(5,4),
    
    -- Provenance
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    extraction_method VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

-- Document-Events: Many-to-many relationship
CREATE TABLE document_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    mention_context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_document_event UNIQUE (document_id, event_id)
);

-- Facts: Extracted facts from documents
CREATE TABLE facts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    
    -- Fact content
    fact_text TEXT NOT NULL,
    source_text TEXT,  -- Excerpt from document showing where fact came from
    page_number INTEGER,
    
    -- Temporal
    event_date DATE,
    event_datetime TIMESTAMP WITH TIME ZONE,
    
    -- Classification
    tags TEXT[],  -- Array of tags/categories
    issues TEXT[],  -- Array of issues identified
    confidence_score DECIMAL(5,4),  -- Extraction confidence (0-1)
    
    -- Review status
    review_status VARCHAR(20) DEFAULT 'not_reviewed' CHECK (review_status IN ('not_reviewed', 'accepted', 'rejected')),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    
    -- Extraction metadata
    extraction_method VARCHAR(50),  -- 'llm', 'pattern', etc.
    extraction_model VARCHAR(100),  -- Model used if LLM
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_fact_per_document UNIQUE (document_id, fact_text, event_date)
);

-- Embeddings Metadata: Metadata about vector embeddings (actual vectors in Qdrant)
CREATE TABLE embeddings_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    
    -- Qdrant reference
    qdrant_collection_name VARCHAR(100) NOT NULL,
    qdrant_point_id VARCHAR(255) NOT NULL,
    
    -- Embedding metadata
    embedding_model VARCHAR(100) NOT NULL,  -- e.g., 'text-embedding-3-large'
    embedding_dimension INTEGER NOT NULL,
    chunk_text TEXT,  -- The text that was embedded
    chunk_index INTEGER,  -- For multi-chunk documents
    chunk_start_position INTEGER,
    chunk_end_position INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT one_source_required CHECK (
        (document_id IS NOT NULL)::int + 
        (entity_id IS NOT NULL)::int + 
        (event_id IS NOT NULL)::int = 1
    ),
    CONSTRAINT unique_qdrant_point UNIQUE (qdrant_collection_name, qdrant_point_id)
);

-- Users: User management for audit trails
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'attorney', 'paralegal', 'user', 'system')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log: Comprehensive audit trail
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Action details
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
        'create', 'update', 'delete', 'view', 'export', 'import', 
        'process', 'extract', 'verify', 'merge', 'link', 'unlink'
    )),
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN (
        'document', 'matter', 'entity', 'relationship', 'event', 'user', 'system'
    )),
    resource_id UUID NOT NULL,
    
    -- User context
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    
    -- Change details
    changes JSONB,  -- Before/after state for updates
    description TEXT,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional context
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Matters indexes
CREATE INDEX idx_matters_type ON matters(matter_type);
CREATE INDEX idx_matters_status ON matters(status);
CREATE INDEX idx_matters_case_number ON matters(case_number);
CREATE INDEX idx_matters_opened_date ON matters(opened_date);
CREATE INDEX idx_matters_metadata ON matters USING GIN(metadata);

-- Documents indexes
CREATE INDEX idx_documents_matter_id ON documents(matter_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_hash_sha256 ON documents(file_hash_sha256);
CREATE INDEX idx_documents_hash_md5 ON documents(file_hash_md5);
CREATE INDEX idx_documents_processing_status ON documents(processing_status);
CREATE INDEX idx_documents_is_current_version ON documents(is_current_version);
CREATE INDEX idx_documents_parent_document_id ON documents(parent_document_id);
CREATE INDEX idx_documents_created_date ON documents(created_date);
CREATE INDEX idx_documents_received_date ON documents(received_date);
CREATE INDEX idx_documents_sent_date ON documents(sent_date);
CREATE INDEX idx_documents_confidentiality ON documents(confidentiality_level);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_categories ON documents USING GIN(categories);
CREATE INDEX idx_documents_metadata ON documents USING GIN(metadata);
CREATE INDEX idx_documents_text_search ON documents USING GIN(to_tsvector('english', COALESCE(extracted_text, '')));

-- Full-text search on title and file_name
CREATE INDEX idx_documents_title_trgm ON documents USING GIN(title gin_trgm_ops);
CREATE INDEX idx_documents_filename_trgm ON documents USING GIN(file_name gin_trgm_ops);

-- Document versions indexes
CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_document_versions_hash_sha256 ON document_versions(file_hash_sha256);
CREATE INDEX idx_document_versions_change_type ON document_versions(change_type);

-- Entities indexes
CREATE INDEX idx_entities_type_id ON entities(entity_type_id);
CREATE INDEX idx_entities_normalized_name ON entities(normalized_name);
CREATE INDEX idx_entities_display_name ON entities(display_name);
CREATE INDEX idx_entities_aliases ON entities USING GIN(aliases);
CREATE INDEX idx_entities_resolved_entity_id ON entities(resolved_entity_id);
CREATE INDEX idx_entities_is_verified ON entities(is_verified);
CREATE INDEX idx_entities_attributes ON entities USING GIN(attributes);
CREATE INDEX idx_entities_name_trgm ON entities USING GIN(normalized_name gin_trgm_ops);

-- Document-Entity indexes
CREATE INDEX idx_document_entities_document_id ON document_entities(document_id);
CREATE INDEX idx_document_entities_entity_id ON document_entities(entity_id);
CREATE INDEX idx_document_entities_mention_text_trgm ON document_entities USING GIN(mention_text gin_trgm_ops);

-- Relationships indexes
CREATE INDEX idx_relationships_type_id ON relationships(relationship_type_id);
CREATE INDEX idx_relationships_source_entity_id ON relationships(source_entity_id);
CREATE INDEX idx_relationships_target_entity_id ON relationships(target_entity_id);
CREATE INDEX idx_relationships_source_document_id ON relationships(source_document_id);
CREATE INDEX idx_relationships_is_active ON relationships(is_active);
CREATE INDEX idx_relationships_start_date ON relationships(start_date);
CREATE INDEX idx_relationships_end_date ON relationships(end_date);
CREATE INDEX idx_relationships_attributes ON relationships USING GIN(attributes);

-- Events indexes
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_event_date ON events(event_date);
CREATE INDEX idx_events_event_datetime ON events(event_datetime);
CREATE INDEX idx_events_location_entity_id ON events(location_entity_id);
CREATE INDEX idx_events_source_document_id ON events(source_document_id);
CREATE INDEX idx_events_participants ON events USING GIN(participants);
CREATE INDEX idx_events_attributes ON events USING GIN(attributes);

-- Document-Events indexes
CREATE INDEX idx_document_events_document_id ON document_events(document_id);
CREATE INDEX idx_document_events_event_id ON document_events(event_id);

-- Facts indexes
CREATE INDEX idx_facts_document_id ON facts(document_id);
CREATE INDEX idx_facts_matter_id ON facts(matter_id);
CREATE INDEX idx_facts_event_date ON facts(event_date);
CREATE INDEX idx_facts_review_status ON facts(review_status);
CREATE INDEX idx_facts_tags ON facts USING GIN(tags);
CREATE INDEX idx_facts_issues ON facts USING GIN(issues);
CREATE INDEX idx_facts_created_at ON facts(created_at);

-- Embeddings metadata indexes
CREATE INDEX idx_embeddings_metadata_document_id ON embeddings_metadata(document_id);
CREATE INDEX idx_embeddings_metadata_entity_id ON embeddings_metadata(entity_id);
CREATE INDEX idx_embeddings_metadata_event_id ON embeddings_metadata(event_id);
CREATE INDEX idx_embeddings_metadata_qdrant_point ON embeddings_metadata(qdrant_collection_name, qdrant_point_id);
CREATE INDEX idx_embeddings_metadata_model ON embeddings_metadata(embedding_model);

-- Audit log indexes
CREATE INDEX idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX idx_audit_log_resource_type ON audit_log(resource_type);
CREATE INDEX idx_audit_log_resource_id ON audit_log(resource_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_changes ON audit_log USING GIN(changes);
CREATE INDEX idx_audit_log_metadata ON audit_log USING GIN(metadata);

-- Composite indexes for common queries
CREATE INDEX idx_documents_matter_status ON documents(matter_id, processing_status);
CREATE INDEX idx_documents_matter_type ON documents(matter_id, document_type);
CREATE INDEX idx_relationships_entities ON relationships(source_entity_id, target_entity_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_matters_updated_at BEFORE UPDATE ON matters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_relationships_updated_at BEFORE UPDATE ON relationships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create audit log entries
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (action_type, resource_type, resource_id, changes)
        VALUES ('delete', TG_TABLE_NAME, OLD.id, row_to_json(OLD)::jsonb);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (action_type, resource_type, resource_id, changes)
        VALUES ('update', TG_TABLE_NAME, NEW.id, 
            jsonb_build_object('old', row_to_json(OLD)::jsonb, 'new', row_to_json(NEW)::jsonb));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (action_type, resource_type, resource_id, changes)
        VALUES ('create', TG_TABLE_NAME, NEW.id, row_to_json(NEW)::jsonb);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers (optional - can be enabled per table as needed)
-- CREATE TRIGGER audit_documents AFTER INSERT OR UPDATE OR DELETE ON documents
--     FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert common entity types
INSERT INTO entity_types (type_name, category, description) VALUES
    ('PERSON', 'person', 'Individual person'),
    ('ORGANIZATION', 'organization', 'Company, firm, or organization'),
    ('LOCATION', 'location', 'Geographic location'),
    ('DATE', 'date', 'Date or time reference'),
    ('MONEY', 'amount', 'Monetary amount'),
    ('CASE_NUMBER', 'document_reference', 'Legal case number'),
    ('CONTRACT', 'document_reference', 'Contract or agreement reference'),
    ('EMAIL_ADDRESS', 'other', 'Email address'),
    ('PHONE_NUMBER', 'other', 'Phone number'),
    ('LEGAL_TERM', 'legal_concept', 'Legal term or concept');

-- Insert common relationship types
INSERT INTO relationship_types (type_name, description, is_directional, category) VALUES
    ('EMPLOYED_BY', 'Employment relationship', TRUE, 'organizational'),
    ('REPRESENTS', 'Legal representation', TRUE, 'legal'),
    ('PARTY_TO', 'Party to legal matter', TRUE, 'legal'),
    ('OCCURRED_AT', 'Event location', TRUE, 'geographic'),
    ('OCCURRED_ON', 'Event date', TRUE, 'temporal'),
    ('INVOLVED_IN', 'Entity involved in event', TRUE, 'legal'),
    ('OWES', 'Financial obligation', TRUE, 'financial'),
    ('OWED_BY', 'Financial claim', TRUE, 'financial'),
    ('RELATED_TO', 'General relationship', FALSE, 'other'),
    ('MERGED_WITH', 'Entity merge/resolution', FALSE, 'organizational');

-- ============================================================================
-- VIEWS (Optional - for common queries)
-- ============================================================================

-- View for current document versions only
CREATE VIEW current_documents AS
SELECT d.*
FROM documents d
WHERE d.is_current_version = TRUE;

-- View for document statistics per matter
CREATE VIEW matter_document_stats AS
SELECT 
    m.id AS matter_id,
    m.matter_number,
    m.matter_name,
    COUNT(d.id) AS total_documents,
    COUNT(DISTINCT d.document_type) AS document_types_count,
    SUM(d.file_size) AS total_size_bytes,
    COUNT(DISTINCT d.file_hash_sha256) AS unique_documents,
    COUNT(d.id) FILTER (WHERE d.processing_status = 'completed') AS processed_documents,
    COUNT(d.id) FILTER (WHERE d.processing_status = 'failed') AS failed_documents
FROM matters m
LEFT JOIN documents d ON m.id = d.matter_id AND d.is_current_version = TRUE
GROUP BY m.id, m.matter_number, m.matter_name;

-- View for entity occurrence counts
CREATE VIEW entity_occurrence_stats AS
SELECT 
    e.id AS entity_id,
    e.normalized_name,
    et.type_name AS entity_type,
    COUNT(DISTINCT de.document_id) AS document_count,
    SUM(de.mention_count) AS total_mentions
FROM entities e
JOIN entity_types et ON e.entity_type_id = et.id
LEFT JOIN document_entities de ON e.id = de.entity_id
GROUP BY e.id, e.normalized_name, et.type_name;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE matters IS 'Legal matters (cases, proceedings, etc.)';
COMMENT ON TABLE documents IS 'Core documents with versioning support';
COMMENT ON TABLE document_versions IS 'Version history and deduplication tracking';
COMMENT ON TABLE entities IS 'Extracted entities (people, organizations, etc.)';
COMMENT ON TABLE relationships IS 'Relationships between entities';
COMMENT ON TABLE events IS 'Events extracted from documents';
COMMENT ON TABLE embeddings_metadata IS 'Metadata for vector embeddings stored in Qdrant';
COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for all system actions';

