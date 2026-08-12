"""_send_batch_and_record: one connection per chunk, one delivery row per recipient."""
import pytest

from app.routers import admin


class _Collection:
    def __init__(self):
        self.rows = []

    async def insert_many(self, docs):
        self.rows.extend(docs)


class _DB:
    def __init__(self):
        self.email_deliveries = _Collection()


@pytest.fixture
def db(monkeypatch):
    fake = _DB()
    monkeypatch.setattr(admin, "motor_db", fake)
    return fake


def _messages(n, start=0):
    return [{"to": f"u{i}@x.edu", "subject": "Welcome", "html_content": "<p>hi</p>"}
            for i in range(start, start + n)]


@pytest.mark.asyncio
async def test_records_a_row_per_recipient(db, monkeypatch):
    calls = []

    def fake_batch(chunk):
        calls.append(len(chunk))
        return {"sent": len(chunk), "failed": []}

    monkeypatch.setattr(admin, "send_email_batch", fake_batch)
    await admin._send_batch_and_record(_messages(20), "org1", "welcome_member")

    assert calls == [20]  # one connection, not 20
    assert len(db.email_deliveries.rows) == 20
    assert {r["status"] for r in db.email_deliveries.rows} == {"sent"}
    assert {r["org_id"] for r in db.email_deliveries.rows} == {"org1"}


@pytest.mark.asyncio
async def test_failed_recipients_recorded_as_failed(db, monkeypatch):
    monkeypatch.setattr(admin, "send_email_batch",
                        lambda chunk: {"sent": 1, "failed": ["u1@x.edu", "u2@x.edu"]})
    await admin._send_batch_and_record(_messages(3), "org1", "welcome_member")

    by_to = {r["to"]: r["status"] for r in db.email_deliveries.rows}
    assert by_to == {"u0@x.edu": "sent", "u1@x.edu": "failed", "u2@x.edu": "failed"}


@pytest.mark.asyncio
async def test_chunks_large_imports(db, monkeypatch):
    calls = []
    monkeypatch.setattr(admin, "send_email_batch",
                        lambda chunk: calls.append(len(chunk)) or {"sent": len(chunk), "failed": []})
    await admin._send_batch_and_record(_messages(120), "org1", "welcome_member")

    assert calls == [50, 50, 20]
    assert len(db.email_deliveries.rows) == 120


@pytest.mark.asyncio
async def test_empty_batch_sends_nothing(db, monkeypatch):
    monkeypatch.setattr(admin, "send_email_batch",
                        lambda chunk: pytest.fail("should not send"))
    await admin._send_batch_and_record([], "org1", "welcome_member")
    assert db.email_deliveries.rows == []
