"""POST /auth/google-token — the endpoint the extension's zero-touch login
(chrome.identity.getAuthToken) depends on. Validates the contract independent
of the extension's own chrome-mocked test of that call."""
import httpx
import pytest

from app.database import motor_db


class _FakeUserinfoResponse:
    def __init__(self, email: str):
        self.status_code = 200
        self._email = email

    def json(self):
        return {"email": self._email, "verified_email": True}


@pytest.fixture
def fake_google_userinfo(monkeypatch):
    """Returns a setter: fake_google_userinfo(email) makes any AsyncClient.get
    call return a canned userinfo payload for that email, regardless of token."""
    state = {"email": None}

    async def _fake_get(self, url, **kwargs):
        return _FakeUserinfoResponse(state["email"])

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    def _set(email: str):
        state["email"] = email
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
