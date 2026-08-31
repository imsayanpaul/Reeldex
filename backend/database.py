from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from backend.config import settings

# Build engine with appropriate settings for SQLite vs PostgreSQL
connect_args = {}
engine_kwargs = {}

if "sqlite" in settings.DATABASE_URL:
    connect_args = {"check_same_thread": False, "timeout": 30.0}
else:
    # PostgreSQL: enable connection health checks and pool recycling
    engine_kwargs = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 5,
        "max_overflow": 10,
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs
)

if "sqlite" in settings.DATABASE_URL:
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL;"))
            conn.execute(text("PRAGMA synchronous=NORMAL;"))
            
            # Ensure new columns exist on SQLite
            try:
                conn.execute(text("ALTER TABLE reels ADD COLUMN collection_id INTEGER;"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE reels ADD COLUMN collection_name TEXT;"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE transcripts ADD COLUMN translated_text TEXT;"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE transcripts ADD COLUMN translated_summary TEXT;"))
            except Exception:
                pass
            conn.commit()
    except Exception as e:
        print(f"[DB Init Migrations]: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
