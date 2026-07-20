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
