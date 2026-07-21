"""Segment 7.3: gunicorn runs multiple workers, each with its own in-memory
scheduler. Only the Redis-lock holder ("leader") may run one, and link-job
registration from any worker must reach the leader via pub/sub instead of
mutating a non-leader's inert scheduler.
"""
import asyncio
import json

import pytest

from app import scheduler as scheduler_module
from app.redis_client import get_redis


@pytest.fixture(autouse=True)
async def _clear_leader_lock():
    await get_redis().delete(scheduler_module._LEADER_LOCK_KEY)
    scheduler_module._is_leader = False
    yield
    await get_redis().delete(scheduler_module._LEADER_LOCK_KEY)
    scheduler_module._is_leader = False


async def test_first_worker_becomes_leader():
    assert await scheduler_module.try_become_leader() is True


async def test_second_worker_does_not_become_leader():
    assert await scheduler_module.try_become_leader() is True
    # A distinct "worker" (different worker id) racing for the same lock key
    # must lose — this is the direct regression test for every interval job
    # firing once per gunicorn worker instead of once total.
    other_worker_id = scheduler_module._worker_id
    scheduler_module._worker_id = "other-worker-id"
    try:
        assert await scheduler_module.try_become_leader() is False
    finally:
        scheduler_module._worker_id = other_worker_id


async def test_release_leadership_lets_another_worker_take_over():
    await scheduler_module.try_become_leader()
    await scheduler_module.release_leadership()
    assert await get_redis().get(scheduler_module._LEADER_LOCK_KEY) is None

    other_worker_id = scheduler_module._worker_id
    scheduler_module._worker_id = "other-worker-id"
    try:
        assert await scheduler_module.try_become_leader() is True
    finally:
        scheduler_module._worker_id = other_worker_id


async def test_publish_link_job_change_reaches_subscriber(monkeypatch):
    """A non-leader worker publishing a change must cause the leader's
    subscriber to actually register the job, not silently no-op."""
    calls = []

    async def _fake_create_text_job(link, update=False):
        calls.append(("create", link, update))

    monkeypatch.setattr(scheduler_module, "create_text_job", _fake_create_text_job)

    subscribe_task = asyncio.create_task(scheduler_module._subscribe_link_job_changes())
    await asyncio.sleep(0.2)  # let the subscription establish before publishing

    link = {"id": 1, "username": "test@example.com", "text": "5", "active": "true"}
    await scheduler_module.publish_link_job_change("create", link, update=True)
    await asyncio.sleep(0.2)  # let the message round-trip

    subscribe_task.cancel()
    try:
        await subscribe_task
    except asyncio.CancelledError:
        pass

    assert len(calls) == 1
    assert calls[0][0] == "create"
    assert calls[0][1]["id"] == 1
    assert calls[0][2] is True
