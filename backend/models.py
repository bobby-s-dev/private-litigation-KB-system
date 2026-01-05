"""SQLAlchemy models matching the PostgreSQL schema."""
from sqlalchemy import (
    Column, String, Integer, BigInteger, Boolean, Text, Date, 
    DateTime, ForeignKey, CheckConstraint, UniqueConstraint, 
    ARRAY, JSON, DECIMAL, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET, TSVECTOR
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid


class Matter(Base):
    """Legal matters table."""
    __tablename__ = "matters"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matter_number = Column(String(100), unique=True, nullable=False)
    matter_name = Column(String(500), nullable=False)
    matter_type = Column(String(50), nullable=False)
    jurisdiction = Column(String(200))
    court_name = Column(String(300))
    case_number = Column(String(100))
    status = Column(String(50), default='active')
    description = Column(Text)
    opened_date = Column(Date)
    closed_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True))
    metadata_json = Column("metadata", JSONB, default={})
    
    # Relationships
    documents = relationship("Document", back_populates="matter", cascade="all, delete-orphan")
    
    __table_args__ = (
        CheckConstraint("matter_type IN ('state', 'federal', 'bankruptcy', 'business', 'other')", name="check_matter_type"),
        CheckConstraint("status IN ('active', 'closed', 'on_hold', 'archived')", name="check_status"),
    )


class Document(Base):
    """Documents table with versioning support."""
    __tablename__ = "documents"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matter_id = Column(UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False)
    document_type = Column(String(50), nullable=False)
    title = Column(String(500))
    file_name = Column(String(500), nullable=False)
    file_path = Column(Text, nullable=False)
    file_size = Column(BigInteger)
    mime_type = Column(String(100))
    file_hash_sha256 = Column(String(64))
    file_hash_md5 = Column(String(32))
    
    # Content extraction
    raw_text = Column(Text)
    extracted_text = Column(Text)
    text_length = Column(Integer)
    
    # Metadata
    author = Column(String(200))
    created_date = Column(DateTime(timezone=True))
    modified_date = Column(DateTime(timezone=True))
    received_date = Column(DateTime(timezone=True))
    sent_date = Column(DateTime(timezone=True))
    sender_email = Column(String(255))
    recipient_emails = Column(ARRAY(String))
    
    # Classification
    confidentiality_level = Column(String(20), default='internal')
    tags = Column(ARRAY(String))
    categories = Column(ARRAY(String))
    
    # Processing status
    processing_status = Column(String(50), default='pending')
    processing_error = Column(Text)
    processed_at = Column(DateTime(timezone=True))
    
    # Versioning
    is_current_version = Column(Boolean, default=True)
    version_number = Column(Integer, default=1)
    parent_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    ingested_at = Column(DateTime(timezone=True), server_default=func.now())
    ingested_by = Column(UUID(as_uuid=True))
    
    # Additional metadata
    metadata_json = Column("metadata", JSONB, default={})
    
    # Relationships
    matter = relationship("Matter", back_populates="documents")
    parent_document = relationship("Document", remote_side=[id], backref="child_documents")
    versions = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan")
    
    __table_args__ = (
        CheckConstraint("document_type IN ('pdf', 'docx', 'email', 'note', 'financial_record', 'other')", name="check_document_type"),
        CheckConstraint("confidentiality_level IN ('public', 'internal', 'confidential', 'privileged', 'restricted')", name="check_confidentiality"),
        CheckConstraint("processing_status IN ('pending', 'processing', 'completed', 'failed', 'needs_review')", name="check_processing_status"),
        UniqueConstraint("matter_id", "file_hash_sha256", name="unique_file_hash_per_matter"),
    )


class DocumentVersion(Base):
    """Document version history and deduplication tracking."""
    __tablename__ = "document_versions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    file_hash_sha256 = Column(String(64), nullable=False)
    file_hash_md5 = Column(String(32))
    file_path = Column(Text, nullable=False)
    file_size = Column(BigInteger)
    
    # Version metadata
    change_type = Column(String(50))
    change_description = Column(Text)
    similarity_score = Column(DECIMAL(5, 4))
    
    # Content comparison
    text_diff_hash = Column(String(64))
    content_changed = Column(Boolean, default=False)
    metadata_changed = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(UUID(as_uuid=True))
    
    # Relationships
    document = relationship("Document", back_populates="versions")
    
    __table_args__ = (
        CheckConstraint("change_type IN ('initial', 'update', 'revision', 'correction', 'duplicate')", name="check_change_type"),
        UniqueConstraint("document_id", "version_number", name="unique_version_per_document"),
    )


class EntityType(Base):
    """Entity type catalog."""
    __tablename__ = "entity_types"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type_name = Column(String(100), unique=True, nullable=False)
    category = Column(String(50), nullable=False)
    description = Column(Text)
    extraction_model = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Entity(Base):
    """Extracted entities."""
    __tablename__ = "entities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type_id = Column(UUID(as_uuid=True), ForeignKey("entity_types.id", ondelete="RESTRICT"), nullable=False)
    normalized_name = Column(String(500), nullable=False)
    display_name = Column(String(500))
    aliases = Column(ARRAY(String))
    
    # Entity attributes
    attributes = Column(JSONB, default={})
    
    # Classification
    confidence_score = Column(DECIMAL(5, 4))
    is_verified = Column(Boolean, default=False)
    verification_notes = Column(Text)
    
    # Resolution
    resolved_entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True))
    
    __table_args__ = (
        UniqueConstraint("entity_type_id", "normalized_name", name="unique_normalized_name_per_type"),
    )


class DocumentEntity(Base):
    """Document-Entity relationship."""
    __tablename__ = "document_entities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    mention_text = Column(Text)
    mention_count = Column(Integer, default=1)
    first_occurrence_position = Column(Integer)
    last_occurrence_position = Column(Integer)
    context_snippets = Column(ARRAY(String))
    extraction_method = Column(String(50))
    confidence_score = Column(DECIMAL(5, 4))
    extracted_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        UniqueConstraint("document_id", "entity_id", name="unique_document_entity"),
    )


class Event(Base):
    """Extracted events."""
    __tablename__ = "events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type = Column(String(100), nullable=False)
    event_name = Column(String(500), nullable=False)
    description = Column(Text)
    
    # Temporal
    event_date = Column(Date)
    event_datetime = Column(DateTime(timezone=True))
    date_confidence = Column(String(20))
    date_range_start = Column(Date)
    date_range_end = Column(Date)
    
    # Location
    location_entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"))
    location_text = Column(String(500))
    
    # Participants
    participants = Column(JSONB, default=[])
    
    # Attributes
    attributes = Column(JSONB, default={})
    confidence_score = Column(DECIMAL(5, 4))
    
    # Provenance
    source_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"))
    extraction_method = Column(String(50))
    is_verified = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True))
    
    __table_args__ = (
        CheckConstraint("date_confidence IN ('exact', 'approximate', 'range', 'unknown')", name="check_date_confidence"),
    )


class DocumentEvent(Base):
    """Document-Event relationship."""
    __tablename__ = "document_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    mention_context = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        UniqueConstraint("document_id", "event_id", name="unique_document_event"),
    )


class Relationship(Base):
    """Entity relationships."""
    __tablename__ = "relationships"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    relationship_type_id = Column(UUID(as_uuid=True), ForeignKey("relationship_types.id", ondelete="RESTRICT"), nullable=False)
    source_entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    target_entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    
    # Relationship attributes
    strength = Column(DECIMAL(5, 4))
    confidence_score = Column(DECIMAL(5, 4))
    attributes = Column(JSONB, default={})
    
    # Provenance
    source_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"))
    extraction_method = Column(String(50))
    is_verified = Column(Boolean, default=False)
    verification_notes = Column(Text)
    
    # Temporal
    start_date = Column(Date)
    end_date = Column(Date)
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True))
    
    __table_args__ = (
        CheckConstraint("source_entity_id != target_entity_id", name="no_self_relationship"),
    )


class RelationshipType(Base):
    """Relationship type catalog."""
    __tablename__ = "relationship_types"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type_name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    is_directional = Column(Boolean, default=True)
    inverse_type_id = Column(UUID(as_uuid=True), ForeignKey("relationship_types.id", ondelete="SET NULL"))
    category = Column(String(50))


class User(Base):
    """User management."""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(200))
    role = Column(String(50), default='user')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'attorney', 'paralegal', 'user', 'system')", name="check_user_role"),
    )


class AuditLog(Base):
    """Audit trail."""
    __tablename__ = "audit_log"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action_type = Column(String(50), nullable=False)
    resource_type = Column(String(50), nullable=False)
    resource_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    username = Column(String(100))
    ip_address = Column(INET)
    user_agent = Column(Text)
    changes = Column(JSONB)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    metadata_json = Column("metadata", JSONB, default={})
    
    __table_args__ = (
        CheckConstraint("action_type IN ('create', 'update', 'delete', 'view', 'export', 'import', 'process', 'extract', 'verify', 'merge', 'link', 'unlink')", name="check_action_type"),
        CheckConstraint("resource_type IN ('document', 'matter', 'entity', 'relationship', 'event', 'user', 'system')", name="check_resource_type"),
    )


class EmbeddingsMetadata(Base):
    """Embedding metadata table."""
    __tablename__ = "embeddings_metadata"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"))
    entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"))
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"))
    
    # Qdrant reference
    qdrant_collection_name = Column(String(100), nullable=False)
    qdrant_point_id = Column(String(255), nullable=False)
    
    # Embedding metadata
    embedding_model = Column(String(100), nullable=False)
    embedding_dimension = Column(Integer, nullable=False)
    chunk_text = Column(Text)
    chunk_index = Column(Integer)
    chunk_start_position = Column(Integer)
    chunk_end_position = Column(Integer)
    
    # Metadata
    metadata_json = Column("metadata", JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        UniqueConstraint("qdrant_collection_name", "qdrant_point_id", name="unique_qdrant_point"),
    )


class Fact(Base):
    """Extracted facts from documents."""
    __tablename__ = "facts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    matter_id = Column(UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False)
    
    # Fact content
    fact_text = Column(Text, nullable=False)
    source_text = Column(Text)
    page_number = Column(Integer)
    
    # Temporal
    event_date = Column(Date)
    event_datetime = Column(DateTime(timezone=True))
    
    # Classification
    tags = Column(ARRAY(String))
    issues = Column(ARRAY(String))
    confidence_score = Column(DECIMAL(5, 4))
    
    # Review status
    review_status = Column(String(20), default='not_reviewed')
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    review_notes = Column(Text)
    
    # Extraction metadata
    extraction_method = Column(String(50))
    extraction_model = Column(String(100))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    document = relationship("Document", backref="facts")
    matter = relationship("Matter", backref="facts")
    
    __table_args__ = (
        CheckConstraint("review_status IN ('not_reviewed', 'accepted', 'rejected')", name="check_review_status"),
        UniqueConstraint("document_id", "fact_text", "event_date", name="unique_fact_per_document"),
    )
