"""
Test env vars must be set before anything imports app.config/app.main — several
modules (app/database.py, app/routers/billing.py) capture get_settings() as a
module-level singleton at import time. .env.test only overrides MONGO_DATABASE;
everything else (MONGO_URI, JWT_SECRET, ENCRYPT_KEY, GMAIL_PWD, ...) falls
through to the real .env in this directory via pydantic-settings' own env_file
loading, since env vars set here take precedence over .env file values but we
only set the one key that needs to differ for tests.
"""
import os
import secrets
from pathlib import Path


def _load_env_test():
    path = Path(__file__).resolve().parent.parent / ".env.test"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_env_test()

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import motor_db
from app.auth import get_confirmed_user, get_current_user

# Unique per pytest session. Test modules that tear down by identifier prefix
# must include this in both the identifiers they create and the regex they
# delete by.
#
# Every run shares one Atlas database (isolated by name, not by run), so a
# teardown keyed on a static prefix like "^rewards-test-" deletes the in-flight
# fixtures of any OTHER run executing at the same time — a second CI job, or CI
# overlapping a developer's local pytest. That produced exactly the failures
# seen on main: rewards lost its attendance rows mid-test and reported 0
# sessions, and the scheduler test lost the class it was asserting on. Both
# passed in isolation and on re-run, which is what a cross-run delete looks like.
RUN_ID = secrets.token_hex(4)


@pytest.fixture(scope="session")
async def client():
    """Triggers lifespan exactly once per test session (index creation is
    idempotent, so this is safe to run repeatedly against a persistent test DB)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _make_client_factory(client):
    def _for(user: dict):
        # Both dependencies, because endpoints are split between them — /users/me
        # and DELETE /users/me take get_current_user, most others take
        # get_confirmed_user. Overriding only one silently 401s half the surface,
        # and an assertion like `assert "field" not in body` then passes against
        # the error payload rather than the real response.
        app.dependency_overrides[get_confirmed_user] = lambda: user
        app.dependency_overrides[get_current_user] = lambda: user
        return client
    return _for


@pytest.fixture
def as_user(client):
    """Usage: resp = await as_user(some_user_dict).get('/foo')
    Sets the auth overrides for the given user dict and returns the shared
    client; supports switching identity more than once per test."""
    factory = _make_client_factory(client)
    yield factory
    app.dependency_overrides.pop(get_confirmed_user, None)
    app.dependency_overrides.pop(get_current_user, None)


# ── Per-role user fixtures ──────────────────────────────────────────────────
# Each inserts a matching `login` doc into the test DB and returns the same
# dict shape get_confirmed_user would normally produce, so DB state and the
# dependency-override identity never disagree. Cleaned up after the test.

async def _insert_user(doc: dict) -> dict:
    await motor_db.login.insert_one(dict(doc))
    return doc


@pytest.fixture
async def institutional_teacher_user():
    from datetime import datetime, timezone
    import secrets
    doc = {
        "username": f"teacher-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "teacher",
        "org_id": "test-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    yield await _insert_user(doc)
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def institutional_admin_user():
    from datetime import datetime, timezone
    import secrets
    doc = {
        "username": f"admin-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "school_admin",
        "org_id": "test-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    yield await _insert_user(doc)
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def personal_user_no_trial():
    from datetime import datetime, timezone
    import secrets
    doc = {
        "username": f"free-{secrets.token_hex(4)}@example.com",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "premium_status": "expired",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    yield await _insert_user(doc)
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def premium_trial_active_user():
    from datetime import datetime, timedelta, timezone
    import secrets
    doc = {
        "username": f"trial-active-{secrets.token_hex(4)}@example.com",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "premium_status": "trial",
        "trial_start": datetime.now(timezone.utc) - timedelta(days=1),
        "trial_end": datetime.now(timezone.utc) + timedelta(days=13),
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    yield await _insert_user(doc)
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def premium_trial_expired_user():
    from datetime import datetime, timedelta, timezone
    import secrets
    doc = {
        "username": f"trial-expired-{secrets.token_hex(4)}@example.com",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "premium_status": "trial",
        "trial_start": datetime.now(timezone.utc) - timedelta(days=20),
        "trial_end": datetime.now(timezone.utc) - timedelta(days=6),
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    yield await _insert_user(doc)
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def premium_active_user():
    from datetime import datetime, timezone
    import secrets
    doc = {
        "username": f"premium-{secrets.token_hex(4)}@example.com",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "premium_status": "active",
        "stripe_customer_id": f"cus_test_{secrets.token_hex(6)}",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    yield await _insert_user(doc)
    await motor_db.login.delete_one({"username": doc["username"]})
