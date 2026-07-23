"""POST /auth/google-token — the endpoint the extension's zero-touch login
(chrome.identity.getAuthToken) depends on. Validates the contract independent
of the extension's own chrome-mocked test of that call."""
import httpx
import pytest

from app.config import get_settings
from app.database import motor_db

_ALLOWED_AUD = get_settings().google_client_id or "test-web-client.apps.googleusercontent.com"


class _FakeTokeninfoResponse:
    def __init__(self, payload: dict):
        self.status_code = 200
        self._payload = payload

    def json(self):
        return self._payload


@pytest.fixture
def fake_google_userinfo(monkeypatch):
    """Returns a setter: fake_google_userinfo(email, aud=..., email_verified=...)
    makes any AsyncClient.get return a canned *tokeninfo* payload.

    tokeninfo, not userinfo — the endpoint validates the token's audience, which
    userinfo never reports. Tests that vary `aud` are the ones covering the
    account-takeover path this replaced.
    """
    state = {"payload": None}

    async def _fake_get(self, url, **kwargs):
        return _FakeTokeninfoResponse(state["payload"])

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    def _set(email: str, aud: str = _ALLOWED_AUD, email_verified: str = "true"):
        state["payload"] = {"email": email, "email_verified": email_verified, "aud": aud}
    return _set


async def test_new_user_auto_provisioned_on_first_google_signin(client, fake_google_userinfo):
    email = "brand-new-student@test.lincoln.edu"
    fake_google_userinfo(email)
    try:
        resp = await client.post("/auth/google-token", json={"access_token": "fake-token"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == email
        assert body["access_token"]

        doc = await motor_db.login.find_one({"username": email})
        assert doc is not None
        assert doc["account_type"] == "personal"
        assert doc["premium_status"] == "trial"
    finally:
        await motor_db.login.delete_one({"username": email})


async def test_existing_institutional_account_matched_not_duplicated(client, fake_google_userinfo, institutional_teacher_user):
    """The core zero-touch-login guarantee: signing in with a Workspace identity
    that matches an existing roster-provisioned account must reuse that account,
    never create a second personal one."""
    fake_google_userinfo(institutional_teacher_user["username"])

    resp = await client.post("/auth/google-token", json={"access_token": "fake-token"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == institutional_teacher_user["username"]
    assert body["account_type"] == "institutional"
    assert body["role"] == "teacher"

    count = await motor_db.login.count_documents({"username": institutional_teacher_user["username"]})
    assert count == 1


async def test_login_intent_rejects_unknown_email_without_creating_account(client, fake_google_userinfo):
    """Regression: "Continue with Google" on the Login tab used to silently
    provision a brand-new empty account for any email with no existing
    account - indistinguishable from account deletion silently failing.
    intent="login" must reject instead of auto-provisioning."""
    email = "never-signed-up@test.lincoln.edu"
    fake_google_userinfo(email)

    resp = await client.post("/auth/google-token", json={"access_token": "fake-token", "intent": "login"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "no_google_account"

    doc = await motor_db.login.find_one({"username": email})
    assert doc is None


async def test_login_intent_still_succeeds_for_existing_account(client, fake_google_userinfo, institutional_teacher_user):
    """intent="login" must not break sign-in for accounts that do exist."""
    fake_google_userinfo(institutional_teacher_user["username"])

    resp = await client.post("/auth/google-token", json={"access_token": "fake-token", "intent": "login"})
    assert resp.status_code == 200
    assert resp.json()["email"] == institutional_teacher_user["username"]


async def test_token_minted_for_another_oauth_client_is_rejected(client, fake_google_userinfo, institutional_teacher_user):
    """Account takeover: a Google access token issued to ANY other app used to
    authenticate here, because userinfo answers for any valid token and never
    says which client it was minted for. The audience must be checked."""
    fake_google_userinfo(
        institutional_teacher_user["username"],
        aud="some-unrelated-app.apps.googleusercontent.com",
    )

    resp = await client.post("/auth/google-token", json={"access_token": "stolen-token"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "google_login_failed"


async def test_unverified_google_email_is_rejected(client, fake_google_userinfo):
    """An unverified address proves nothing about who controls it."""
    email = "unverified@test.lincoln.edu"
    fake_google_userinfo(email, email_verified="false")

    resp = await client.post("/auth/google-token", json={"access_token": "fake-token"})
    assert resp.status_code == 400

    assert await motor_db.login.find_one({"username": email}) is None


async def test_ensure_unique_username_index_migrates_and_is_idempotent():
    """_ensure_unique_username_index (run in the app's lifespan) drops the legacy
    non-unique index and builds a unique one, so the concurrent-signup race below
    is caught at the DB rather than silently producing two docs for one email.
    Called directly because httpx's ASGITransport does not fire lifespan events."""
    from app.main import _ensure_unique_username_index

    await _ensure_unique_username_index()
    info = await motor_db.login.index_information()
    unique = [
        name for name, spec in info.items()
        if spec.get("key") == [("username", 1)] and spec.get("unique")
    ]
    assert unique, f"login.username is not a unique index after migration: {info}"
    # No duplicate non-unique index left behind on the same key.
    assert "username_1" not in info or info["username_1"].get("unique")
    # Idempotent: a second run sees the unique index already present and no-ops.
    await _ensure_unique_username_index()


async def test_google_signup_race_converges_on_one_account(client, fake_google_userinfo, monkeypatch):
    """Two concurrent first-time Google sign-ins for the same address both pass
    the find_one check; the loser's insert raises DuplicateKeyError. The right
    answer is not to 500 but to converge on the winner's document — it is the same
    person. Simulated by making the insert lose the race deterministically."""
    from pymongo.errors import DuplicateKeyError
    from motor.motor_asyncio import AsyncIOMotorCollection

    email = "google-race@test.lincoln.edu"
    fake_google_userinfo(email)
    orig_insert = AsyncIOMotorCollection.insert_one

    async def racing_insert(self, doc, *a, **k):
        # Only the login insert for this email loses the race; everything else
        # (audit, analytics, other collections) inserts normally.
        if self.name == "login" and doc.get("username") == email:
            await orig_insert(self, {**doc, "user_id": "race-winner-uid"})
            raise DuplicateKeyError("E11000 duplicate key: username")
        return await orig_insert(self, doc, *a, **k)

    monkeypatch.setattr(AsyncIOMotorCollection, "insert_one", racing_insert)
    try:
        resp = await client.post("/auth/google-token", json={"access_token": "fake-token"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["email"] == email

        monkeypatch.undo()  # restore before asserting on the DB
        docs = [d async for d in motor_db.login.find({"username": email})]
        assert len(docs) == 1, "must not create a second doc for the same email"
        assert docs[0]["user_id"] == "race-winner-uid", "converged on the winner"
    finally:
        monkeypatch.undo()
        await motor_db.login.delete_many({"username": email})
