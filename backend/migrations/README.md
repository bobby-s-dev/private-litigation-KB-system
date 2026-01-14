# Database Migrations

This directory contains database migration scripts.

## Running Migrations

### Option 1: Using the migration runner script

```bash
cd backend
python run_migration.py add_entity_review_columns.sql
```

### Option 2: Using psql directly

```bash
psql -U your_username -d your_database -f migrations/add_entity_review_columns.sql
```

### Option 3: Using Docker (if database is in Docker)

```bash
docker exec -i your_postgres_container psql -U your_username -d your_database < migrations/add_entity_review_columns.sql
```

## Available Migrations

### add_entity_review_columns.sql
Adds review status columns to the entities table:
- `review_status` (VARCHAR(20), default: 'not_reviewed')
- `reviewed_at` (TIMESTAMP WITH TIME ZONE)
- `reviewed_by` (UUID)
- `review_notes` (TEXT)

This migration is safe to run multiple times (uses IF NOT EXISTS).

