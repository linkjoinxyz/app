"""DELETE /users/me must cancel billing before it deletes the account.

It previously deleted the login document and left the Stripe subscription live,
so the user kept getting charged with no way back in to stop it.
"""
import pytest
import stripe

from app.database import motor_db


@pytest.fixture
def fake_stripe_cancel(monkeypatch):
    """Returns the list of subscription ids cancel was called with."""
    calls = []

    async def _cancel(sub_id, **kwargs):
        calls.append(sub_id)
        return {"id": sub_id, "status": "canceled"}

    monkeypatch.setattr(stripe.Subscription, "cancel_async", _cancel, raising=False)
    return calls


@pytest.fixture
def failing_stripe_cancel(monkeypatch):
    async def _cancel(sub_id, **kwargs):
        raise stripe.APIConnectionError("network down")

    monkeypatch.setattr(stripe.Subscription, "cancel_async", _cancel, raising=False)


async def test_subscription_is_cancelled_before_deletion(as_user, premium_active_user, fake_stripe_cancel):
    sub_id = "sub_test_deletion_1"
    await motor_db.login.update_one(
        {"username": premium_active_user["username"]},
        {"$set": {"stripe_subscription_id": sub_id}},
    )
    premium_active_user["stripe_subscription_id"] = sub_id

    resp = await as_user(premium_active_user).delete("/users/me")
    assert resp.status_code == 200
    assert fake_stripe_cancel == [sub_id]
    assert await motor_db.login.find_one({"username": premium_active_user["username"]}) is None


async def test_account_survives_when_cancel_fails(as_user, premium_active_user, failing_stripe_cancel):
    """Deleting the account while the subscription survives is the exact failure
    this guards against — and the user would have no way back in to fix it. So a
    failed cancel must abort the whole deletion."""
    await motor_db.login.update_one(
        {"username": premium_active_user["username"]},
        {"$set": {"stripe_subscription_id": "sub_test_deletion_2"}},
    )
    premium_active_user["stripe_subscription_id"] = "sub_test_deletion_2"

    resp = await as_user(premium_active_user).delete("/users/me")
    assert resp.status_code == 502
    assert await motor_db.login.find_one({"username": premium_active_user["username"]}) is not None


async def test_account_without_subscription_deletes_cleanly(as_user, personal_user_no_trial, fake_stripe_cancel):
    resp = await as_user(personal_user_no_trial).delete("/users/me")
    assert resp.status_code == 200
    assert fake_stripe_cancel == []
    assert await motor_db.login.find_one({"username": personal_user_no_trial["username"]}) is None


async def test_deletion_clears_roster_and_parent_references(as_user, personal_user_no_trial, fake_stripe_cancel):
    """Dangling user_id references in classes/parent_links were how orphaned
    roster entries accumulated."""
    uid = personal_user_no_trial["user_id"]
    await motor_db.classes.insert_one({"class_id": "cls-del-test", "student_ids": [uid, "other"]})
    await motor_db.parent_links.insert_one({"parent_user_id": "p1", "student_user_id": uid})
    try:
        resp = await as_user(personal_user_no_trial).delete("/users/me")
        assert resp.status_code == 200

        cls = await motor_db.classes.find_one({"class_id": "cls-del-test"})
        assert uid not in cls["student_ids"]
        assert await motor_db.parent_links.count_documents({"student_user_id": uid}) == 0
    finally:
        await motor_db.classes.delete_many({"class_id": "cls-del-test"})
        await motor_db.parent_links.delete_many({"student_user_id": uid})
