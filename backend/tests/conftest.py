import os
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet

# Configure an isolated database + throwaway secrets BEFORE the app is imported.
_tmp = Path(tempfile.mkdtemp()) / "test_wallet.db"
# TEST_DATABASE_URL lets the same suite run against Postgres (see README).
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}"
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["WALLET_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["GEMINI_API_KEY"] = "test-gemini-key"
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["SEED_DEMO_DATA"] = "true"

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

_counter = itertools.count()


@pytest.fixture(scope="session")
def _app_started():
    with TestClient(app) as c:  # runs lifespan -> migrations
        yield c


@pytest.fixture
def client(_app_started):
    # Fresh cookie jar per test.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def creds():
    n = next(_counter)
    return {"email": f"user{n}@example.com", "password": "Sup3rSecret!", "pin": "4821"}


@pytest.fixture
def registered(client, creds):
    r = client.post("/api/v1/auth/register", json=creds)
    assert r.status_code == 201, r.text
    return creds
