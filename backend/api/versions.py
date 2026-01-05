"""FastAPI endpoints for version management, canonical selection, and diff viewing."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID

from database import get_db
from models import Document
from services.version_management import VersionManagementService
from services.canonical_selection import CanonicalSelectionService
from services.diff_merge import DiffMergeService

router = APIRouter(prefix="/api/versions", tags=["versions"])


@router.get("/{document_id}/chain")
async def get_version_chain(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get the complete version chain for a document."""
    version_service = VersionManagementService(db)
    chain = version_service.get_version_chain(document_id)
    
    if not chain:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        'document_id': document_id,
        'version_count': len(chain),
        'versions': [
            {
                'id': str(doc.id),
                'version_number': doc.version_number,
                'is_current': doc.is_current_version,
                'file_name': doc.file_name,
                'created_at': doc.created_at.isoformat() if doc.created_at else None,
                'file_size': doc.file_size,
                'text_length': doc.text_length,
            }
            for doc in chain
        ]
    }


@router.get("/{document_id}/current")
async def get_current_version(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get the current version of a document."""
    version_service = VersionManagementService(db)
    current = version_service.get_current_version(document_id)
    
    if not current:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        'document_id': str(current.id),
        'version_number': current.version_number,
        'is_current': current.is_current_version,
        'file_name': current.file_name,
        'created_at': current.created_at.isoformat() if current.created_at else None,
    }


@router.get("/{document_id}/canonical")
async def get_canonical_version(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get the canonical (best) version for a document."""
    version_service = VersionManagementService(db)
    canonical = version_service.get_canonical_version(document_id)
    
    if not canonical:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        'document_id': str(canonical.id),
        'version_number': canonical.version_number,
        'is_canonical': canonical.metadata.get('is_canonical', False) if canonical.metadata else False,
        'file_name': canonical.file_name,
        'created_at': canonical.created_at.isoformat() if canonical.created_at else None,
    }


@router.post("/{document_id}/ensure-canonical")
async def ensure_canonical_version(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Ensure a canonical version is set for the document's duplicate group."""
    version_service = VersionManagementService(db)
    canonical = version_service.ensure_canonical_version(document_id)
    
    if not canonical:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        'canonical_document_id': str(canonical.id),
        'version_number': canonical.version_number,
        'message': 'Canonical version set',
    }


@router.get("/{document_id}/diff")
async def get_version_diff(
    document_id: str,
    compare_with: Optional[str] = Query(None, description="Document ID to compare with"),
    version_from: Optional[int] = Query(None, description="Version number to compare from"),
    version_to: Optional[int] = Query(None, description="Version number to compare to"),
    diff_format: str = Query('unified', description="Diff format: unified, context"),
    context_lines: Optional[int] = Query(None, description="Number of context lines"),
    db: Session = Depends(get_db)
):
    """
    Get diff between two document versions.
    
    Can compare:
    - Two specific document IDs (compare_with)
    - Two versions of the same document (version_from, version_to)
    """
    diff_service = DiffMergeService(db)
    
    # Get first document
    doc1 = db.query(Document).filter(Document.id == document_id).first()
    if not doc1:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Get second document
    if compare_with:
        doc2 = db.query(Document).filter(Document.id == compare_with).first()
        if not doc2:
            raise HTTPException(status_code=404, detail="Compare document not found")
    elif version_from and version_to:
        version_service = VersionManagementService(db)
        chain = version_service.get_version_chain(document_id)
        
        doc1 = next((d for d in chain if d.version_number == version_from), None)
        doc2 = next((d for d in chain if d.version_number == version_to), None)
        
        if not doc1 or not doc2:
            raise HTTPException(status_code=404, detail="Version not found in chain")
    else:
        # Compare with previous version
        version_service = VersionManagementService(db)
        chain = version_service.get_version_chain(document_id)
        
        if len(chain) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 versions to compare")
        
        doc1 = chain[-2]  # Previous version
        doc2 = chain[-1]  # Current version
    
    # Generate diff
    diff_result = diff_service.generate_diff(
        doc1,
        doc2,
        diff_format=diff_format,
        context_lines=context_lines
    )
    
    return diff_result


@router.get("/{document_id}/comparison")
async def get_version_comparison(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get comprehensive comparison across all versions in a chain."""
    version_service = VersionManagementService(db)
    diff_service = DiffMergeService(db)
    
    chain = version_service.get_version_chain(document_id)
    
    if not chain:
        raise HTTPException(status_code=404, detail="Document not found")
    
    comparison = diff_service.generate_version_comparison(chain)
    
    return comparison


@router.post("/{document_id}/merge")
async def merge_versions(
    document_id: str,
    merge_strategy: str = Query('canonical', description="Merge strategy: canonical, union"),
    db: Session = Depends(get_db)
):
    """Generate merged artifact from all versions of a document."""
    version_service = VersionManagementService(db)
    diff_service = DiffMergeService(db)
    
    chain = version_service.get_version_chain(document_id)
    
    if not chain:
        raise HTTPException(status_code=404, detail="Document not found")
    
    merge_result = diff_service.generate_merge_artifact(chain, merge_strategy=merge_strategy)
    
    return merge_result


@router.get("/matter/{matter_id}/duplicate-groups")
async def get_duplicate_groups(
    matter_id: str,
    similarity_threshold: Optional[float] = Query(None, description="Similarity threshold"),
    db: Session = Depends(get_db)
):
    """Find all duplicate/near-duplicate document groups in a matter."""
    canonical_service = CanonicalSelectionService(db)
    
    groups = canonical_service.find_duplicate_groups(
        matter_id,
        similarity_threshold=similarity_threshold
    )
    
    return {
        'matter_id': matter_id,
        'duplicate_groups_count': len(groups),
        'groups': [
            {
                'group_id': i,
                'document_count': len(group),
                'documents': [
                    {
                        'id': str(doc.id),
                        'version_number': doc.version_number,
                        'file_name': doc.file_name,
                        'similarity_scores': doc.metadata.get('near_duplicates', []) if doc.metadata else [],
                    }
                    for doc in group
                ],
                'canonical_document_id': next(
                    (str(d.id) for d in group if d.metadata and d.metadata.get('is_canonical')),
                    None
                ),
            }
            for i, group in enumerate(groups)
        ]
    }


@router.post("/matter/{matter_id}/duplicate-group/{group_id}/set-canonical")
async def set_group_canonical(
    matter_id: str,
    group_id: int,
    document_id: Optional[str] = Query(None, description="Specific document ID to set as canonical"),
    db: Session = Depends(get_db)
):
    """Set canonical version for a duplicate group."""
    canonical_service = CanonicalSelectionService(db)
    
    groups = canonical_service.find_duplicate_groups(matter_id)
    
    if group_id >= len(groups):
        raise HTTPException(status_code=404, detail="Duplicate group not found")
    
    group = groups[group_id]
    
    if document_id:
        # Set specific document as canonical
        target_doc = next((d for d in group if str(d.id) == document_id), None)
        if not target_doc:
            raise HTTPException(status_code=404, detail="Document not found in group")
        
        # Mark as canonical
        for doc in group:
            if not doc.metadata:
                doc.metadata = {}
            doc.metadata['is_canonical'] = (doc.id == target_doc.id)
            doc.metadata['canonical_document_id'] = str(target_doc.id)
        
        db.commit()
        canonical = target_doc
    else:
        # Auto-select canonical
        canonical = canonical_service.set_canonical_version(group)
    
    return {
        'canonical_document_id': str(canonical.id),
        'version_number': canonical.version_number,
        'file_name': canonical.file_name,
        'message': 'Canonical version set',
    }

