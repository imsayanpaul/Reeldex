"""Test setup: an isolated SQLite database, a known Meta app secret, and no real AI or Instagram calls.

Environment variables must be set before `backend` is imported, because settings are read at import time.
We also run from a temporary directory so the developer's own `.env` is never loaded.
"""
import os
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="reeldex-tests-")

os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/test.db"
os.environ["META_APP_SECRET"] = "test-secret"
os.environ["GROQ_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["INSTAGRAM_PAGE_ACCESS_TOKEN"] = ""
sys.path.insert(0, ROOT)
os.chdir(TMP)

from fastapi.testclient import TestClient  # noqa: E402

import backend.routes as routes  # noqa: E402

routes.process_reel_pipeline = lambda *args, **kwargs: None  # never download or transcribe in tests

from backend.main import app  # noqa: E402
from backend.database import SessionLocal  # noqa: E402

META_SECRET = b"test-secret"


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="session")
def user_a(client):
    return client.post("/api/auth/session", json={}).json()["auth_token"]


@pytest.fixture(scope="session")
def user_b(client):
    return client.post("/api/auth/session", json={}).json()["auth_token"]
