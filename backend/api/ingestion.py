"""FastAPI endpoints for document ingestion."""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
import uuid
import os
import shutil

from database import get_db
from models import Matter
from services.ingestion import IngestionService
from config import settings

router = APIRouter(prefix="/api/ingestion", tags=["ingestion"])


@router.post("/upload")
async def upload_file(
    matter_id: str,
    file: UploadFile = File(...),
    document_type: Optional[str] = None,
    tags: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """
    Upload a single file for ingestion.
    
    Supports: PDF, DOCX, MSG, EML, TXT, CSV, images (with OCR)
    """
    # Verify matter exists
    matter = db.query(Matter).filter(Matter.id == matter_id).first()
    if not matter:
        raise HTTPException(status_code=404, detail=f"Matter {matter_id} not found")
    
    # Check file size
    file_content = await file.read()
    file_size_mb = len(file_content) / (1024 * 1024)
    if file_size_mb > settings.max_file_size_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File size ({file_size_mb:.2f} MB) exceeds maximum ({settings.max_file_size_mb} MB)"
        )
    
    # Save file temporarily
    ingestion_run_id = str(uuid.uuid4())
    temp_dir = Path(settings.upload_dir) / "temp" / ingestion_run_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    temp_file_path = temp_dir / file.filename
    
    try:
        with open(temp_file_path, 'wb') as f:
            f.write(file_content)
        
        # Create ingestion service
        ingestion_service = IngestionService(db, ingestion_run_id)
        
        # Ingest file
        result = ingestion_service.ingest_file(
            file_path=temp_file_path,
            matter_id=matter_id,
            filename=file.filename,
            document_type=document_type,
            user_id=user_id,
            tags=tags,
            categories=categories
        )
        
        # Clean up temp file
        if temp_file_path.exists():
            temp_file_path.unlink()
        if temp_dir.exists():
            temp_dir.rmdir()
        
        return JSONResponse(content=result)
    
    except Exception as e:
        # Clean up on error
        if temp_file_path.exists():
            temp_file_path.unlink()
        if temp_dir.exists():
            temp_dir.rmdir()
        
        raise HTTPException(status_code=500, detail=f"Error ingesting file: {str(e)}")


@router.post("/upload-batch")
async def upload_batch(
    matter_id: str,
    files: List[UploadFile] = File(...),
    document_type: Optional[str] = None,
    tags: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Upload multiple files for ingestion.
    
    Returns results for each file.
    """
    # Verify matter exists
    matter = db.query(Matter).filter(Matter.id == matter_id).first()
    if not matter:
        raise HTTPException(status_code=404, detail=f"Matter {matter_id} not found")
    
    ingestion_run_id = str(uuid.uuid4())
    results = []
    
    for file in files:
        try:
            # Check file size
            file_content = await file.read()
            file_size_mb = len(file_content) / (1024 * 1024)
            if file_size_mb > settings.max_file_size_mb:
                results.append({
                    'filename': file.filename,
                    'success': False,
                    'error': f"File size exceeds maximum ({settings.max_file_size_mb} MB)"
                })
                continue
            
            # Save file temporarily
            temp_dir = Path(settings.upload_dir) / "temp" / ingestion_run_id
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file_path = temp_dir / file.filename
            
            with open(temp_file_path, 'wb') as f:
                f.write(file_content)
            
            # Ingest file
            ingestion_service = IngestionService(db, ingestion_run_id)
            result = ingestion_service.ingest_file(
                file_path=temp_file_path,
                matter_id=matter_id,
                filename=file.filename,
                document_type=document_type,
                user_id=user_id,
                tags=tags,
                categories=categories
            )
            
            result['filename'] = file.filename
            results.append(result)
            
            # Clean up temp file
            if temp_file_path.exists():
                temp_file_path.unlink()
        
        except Exception as e:
            results.append({
                'filename': file.filename,
                'success': False,
                'error': str(e)
            })
    
    # Clean up temp directory
    temp_dir = Path(settings.upload_dir) / "temp" / ingestion_run_id
    if temp_dir.exists():
        try:
            temp_dir.rmdir()
        except:
            pass
    
    return JSONResponse(content={
        'ingestion_run_id': ingestion_run_id,
        'total_files': len(files),
        'results': results
    })


@router.post("/import-folder")
async def import_folder(
    matter_id: str,
    folder_path: str,
    document_type: Optional[str] = None,
    tags: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    recursive: bool = True,
    db: Session = Depends(get_db)
):
    """
    Import all files from a server-side folder.
    
    Supports recursive directory traversal.
    """
    # Verify matter exists
    matter = db.query(Matter).filter(Matter.id == matter_id).first()
    if not matter:
        raise HTTPException(status_code=404, detail=f"Matter {matter_id} not found")
    
    # Validate folder path
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder_path}")
    
    # Security: Ensure folder is within allowed paths (adjust as needed)
    # For now, we'll allow any path, but in production, restrict this
    
    ingestion_run_id = str(uuid.uuid4())
    ingestion_service = IngestionService(db, ingestion_run_id)
    
    # Supported file extensions
    supported_extensions = {
        '.pdf', '.docx', '.doc', '.msg', '.eml', '.txt', '.csv',
        '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'
    }
    
    results = []
    files_processed = 0
    
    # Walk directory
    pattern = "**/*" if recursive else "*"
    for file_path in folder.glob(pattern):
        if not file_path.is_file():
            continue
        
        if file_path.suffix.lower() not in supported_extensions:
            continue
        
        try:
            result = ingestion_service.ingest_file(
                file_path=file_path,
                matter_id=matter_id,
                filename=file_path.name,
                document_type=document_type,
                user_id=user_id,
                tags=tags,
                categories=categories
            )
            
            result['file_path'] = str(file_path)
            results.append(result)
            files_processed += 1
        
        except Exception as e:
            results.append({
                'file_path': str(file_path),
                'filename': file_path.name,
                'success': False,
                'error': str(e)
            })
    
    return JSONResponse(content={
        'ingestion_run_id': ingestion_run_id,
        'folder_path': str(folder),
        'files_processed': files_processed,
        'total_files_found': len(results),
        'results': results
    })


@router.get("/status/{ingestion_run_id}")
async def get_ingestion_status(
    ingestion_run_id: str,
    db: Session = Depends(get_db)
):
    """
    Get status of an ingestion run.
    
    Returns summary of documents ingested in this run.
    """
    from models import Document, AuditLog
    
    # Get all documents from this ingestion run
    documents = db.query(Document).filter(
        Document.metadata_json['ingestion_run_id'].astext == ingestion_run_id
    ).all()
    
    # Get audit log entries
    audit_entries = db.query(AuditLog).filter(
        AuditLog.metadata_json['ingestion_run_id'].astext == ingestion_run_id
    ).all()
    
    status_summary = {
        'ingestion_run_id': ingestion_run_id,
        'total_documents': len(documents),
        'successful': len([d for d in documents if d.processing_status == 'completed']),
        'failed': len([d for d in documents if d.processing_status == 'failed']),
        'duplicates': len([d for d in documents if 'duplicate' in str(d.metadata_json)]),
        'documents': [
            {
                'id': str(d.id),
                'filename': d.file_name,
                'status': d.processing_status,
                'document_type': d.document_type,
                'created_at': d.created_at.isoformat() if d.created_at else None,
            }
            for d in documents
        ]
    }
    
    return JSONResponse(content=status_summary)

