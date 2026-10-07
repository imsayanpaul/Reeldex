from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
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

def _normalize_url(url: str) -> str:
    """Use the installed psycopg2 driver whatever scheme the host gives us
    (postgres://, postgresql://, postgresql+psycopg://)."""
    for prefix in ("postgres://", "postgresql://", "postgresql+psycopg://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    return url


engine = create_engine(
    _normalize_url(settings.DATABASE_URL),
    connect_args=connect_args,
    **engine_kwargs
)

if "sqlite" in settings.DATABASE_URL:
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL;"))
            conn.execute(text("PRAGMA synchronous=NORMAL;"))
            conn.commit()
    except Exception as e:
        print(f"[DB Init]: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first release. Each ALTER runs in its own transaction
# and fails harmlessly when the column already exists (SQLite has no IF NOT EXISTS).
_ADDED_COLUMNS = [
    ("reels", "collection_id", "INTEGER"),
    ("reels", "caption", "TEXT"),
    ("transcripts", "translated_text", "TEXT"),
    ("transcripts", "translated_summary", "TEXT"),
]


def run_migrations():
    from sqlalchemy import inspect, text
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    is_postgres = engine.dialect.name == "postgresql"
    for table, column, col_type in _ADDED_COLUMNS:
        try:
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            with engine.begin() as conn:
                # During a deploy the old instance still holds connections; never wait on its locks,
                # or startup hangs and the health check fails the deploy
                if is_postgres:
                    conn.execute(text("SET LOCAL lock_timeout = '5s'"))
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            print(f"[DB Migration] Added {table}.{column}")
        except Exception as e:
            print(f"[DB Migration] {table}.{column}: {e}")
