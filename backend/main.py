"""Main FastAPI application for litigation knowledge system."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import engine, Base
from config import settings
from api.ingestion import router as ingestion_router
from api.versions import router as versions_router
from api.embeddings import router as embeddings_router
from api.rag import router as rag_router
from api.documents import router as documents_router
from api.matters import router as matters_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup: Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cleanup if needed
    pass


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Litigation Knowledge System - Document Ingestion API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(matters_router)
app.include_router(ingestion_router)
app.include_router(versions_router)
app.include_router(embeddings_router)
app.include_router(rag_router)
app.include_router(documents_router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Litigation Knowledge System API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )

