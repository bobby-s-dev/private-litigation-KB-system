# Litigation Knowledge System

A comprehensive legal case management system with document ingestion, AI-powered analysis, and a modern web interface.

## Project Structure

```
.
├── backend/          # FastAPI backend (Python)
│   ├── api/         # API endpoints
│   ├── services/    # Business logic services
│   ├── main.py      # FastAPI application entry point
│   └── ...
│
└── frontend/        # Next.js frontend (TypeScript + TailwindCSS)
    ├── app/        # Next.js app directory
    ├── components/  # React components
    └── ...
```

## Quick Start

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Initialize the database:
```bash
psql -U your_user -d your_database -f schema.sql
```

5. Run the backend server:
```bash
python main.py
# Or with uvicorn:
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Features

### Backend
- Multi-format document support (PDF, DOCX, MSG, EML, TXT, CSV, images)
- Document deduplication (exact and near-duplicate detection)
- Version management and tracking
- Metadata extraction
- Vector embeddings with Qdrant
- RAG (Retrieval Augmented Generation) capabilities
- Event extraction and timeline generation
- Link analysis for entity relationships

### Frontend
- Modern, responsive UI with TailwindCSS
- Case management dashboard
- Document upload and review interface
- AI-powered features:
  - Document summarization
  - Fact search
  - Claims and issues outlining
  - Strategic brainstorming
  - Document search
- Entity visualization with charts
- Activity tracking

## Documentation

- Backend documentation: See `backend/README.md`
- Frontend documentation: See `frontend/README_FRONTEND.md`
- API documentation: Available at `http://localhost:8000/docs` when backend is running

## Development

Both backend and frontend can be run simultaneously:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`

The frontend is configured to connect to the backend API. Make sure both services are running for full functionality.

## License

[Your License Here]

