"""Helper script to set up the database."""
import sys
from pathlib import Path
from sqlalchemy import create_engine, text
from config import settings

def setup_database():
    """Create database tables from schema.sql."""
    schema_file = Path(__file__).parent / "schema.sql"
    
    if not schema_file.exists():
        print(f"Error: schema.sql not found at {schema_file}")
        sys.exit(1)
    
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    try:
        engine = create_engine(settings.database_url)
        
        # Read schema file
        with open(schema_file, 'r') as f:
            schema_sql = f.read()
        
        # Execute schema
        with engine.connect() as conn:
            # Split by semicolon and execute statements
            statements = [s.strip() for s in schema_sql.split(';') if s.strip()]
            
            for i, statement in enumerate(statements, 1):
                try:
                    conn.execute(text(statement))
                    print(f"Executed statement {i}/{len(statements)}")
                except Exception as e:
                    print(f"Warning: Error executing statement {i}: {str(e)}")
            
            conn.commit()
        
        print("Database setup completed successfully!")
        
    except Exception as e:
        print(f"Error setting up database: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    setup_database()

