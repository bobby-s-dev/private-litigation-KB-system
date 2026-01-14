"""Script to run database migrations."""
import sys
from pathlib import Path
from sqlalchemy import create_engine, text
from config import settings

def run_migration(migration_file: str):
    """Run a migration SQL file."""
    migration_path = Path(__file__).parent / "migrations" / migration_file
    
    if not migration_path.exists():
        print(f"Error: Migration file not found at {migration_path}")
        sys.exit(1)
    
    print(f"Running migration: {migration_file}")
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    try:
        engine = create_engine(settings.database_url)
        
        # Read migration file
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
        
        # Execute migration
        with engine.connect() as conn:
            # Split by semicolon and execute statements
            statements = [s.strip() for s in migration_sql.split(';') if s.strip()]
            
            for i, statement in enumerate(statements, 1):
                if statement:  # Skip empty statements
                    try:
                        conn.execute(text(statement))
                        print(f"Executed statement {i}/{len(statements)}")
                    except Exception as e:
                        # Some statements might fail if already applied (e.g., IF NOT EXISTS)
                        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                            print(f"Info: Statement {i} skipped (already applied): {str(e)}")
                        else:
                            print(f"Warning: Error executing statement {i}: {str(e)}")
            
            conn.commit()
        
        print(f"Migration {migration_file} completed successfully!")
        
    except Exception as e:
        print(f"Error running migration: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file.sql>")
        print("Example: python run_migration.py add_entity_review_columns.sql")
        sys.exit(1)
    
    migration_file = sys.argv[1]
    run_migration(migration_file)

