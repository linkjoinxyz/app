"""Stripe webhook state machine (billing.py::stripe_webhook). construct_event's
real HMAC verification is Stripe's library code, not ours — monkeypatched to a
passthrough so tests focus on our own event-handling branches."""
import json

import pytest

from app.database import motor_db


@pytest.fixture(autouse=True)
def _bypass_stripe_signature(monkeypatch):
    import stripe

    def _fake_construct_event(payload, sig, secret):
        return json.loads(payload)

    monkeypatch.setattr(stripe.Webhook, "construct_event", _fake_construct_event)


def _event(event_type: str, data_object: dict) -> bytes:
    return json.dumps({"type": event_type, "data": {"object": data_object}}).encode()


async def test_checkout_completed_activates_matched_customer(client, premium_trial_active_user):
    customer_id = "cus_test_checkout_1"
    await motor_db.login.update_one(
        {"username": premium_trial_active_user["username"]},
        {"$set": {"stripe_customer_id": customer_id}},
    )
    payload = _event("checkout.session.completed", {
        "customer": customer_id,
        "subscription": "sub_test_1",
        "client_reference_id": premium_trial_active_user["user_id"],
    })

    resp = await client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": "t=1,v1=fake"})
    assert resp.status_code == 200

    doc = await motor_db.login.find_one({"username": premium_trial_active_user["username"]})
    assert doc["premium_status"] == "active"
    assert doc["stripe_subscription_id"] == "sub_test_1"
    assert doc["trial_start"] is None
    assert doc["trial_end"] is None


async def test_checkout_completed_falls_back_to_client_reference_id(client, premium_trial_active_user):
    """No stripe_customer_id set yet on the user — webhook must match by client_reference_id."""
    payload = _event("checkout.session.completed", {
        "customer": "cus_test_new_customer",
        "subscription": "sub_test_2",
        "client_reference_id": premium_trial_active_user["user_id"],
    })

    resp = await client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": "t=1,v1=fake"})
    assert resp.status_code == 200

    doc = await motor_db.login.find_one({"username": premium_trial_active_user["username"]})
    assert doc["premium_status"] == "active"
    assert doc["stripe_customer_id"] == "cus_test_new_customer"


async def test_checkout_completed_unknown_customer_is_noop(client):
    payload = _event("checkout.session.completed", {
        "customer": "cus_does_not_exist",
        "subscription": "sub_test_3",
        "client_reference_id": "user_does_not_exist",
    })
    resp = await client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": "t=1,v1=fake"})
    assert resp.status_code == 200
    assert resp.json() == {"received": True}


async def test_subscription_deleted_expires_matched_customer(client, premium_active_user):
    payload = _event("customer.subscription.deleted", {
        "customer": premium_active_user["stripe_customer_id"],
    })
    resp = await client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": "t=1,v1=fake"})
    assert resp.status_code == 200

    doc = await motor_db.login.find_one({"username": premium_active_user["username"]})
    assert doc["premium_status"] == "expired"
    assert doc["stripe_subscription_id"] is None


@pytest.mark.parametrize("status_value", ["canceled", "unpaid"])
async def test_subscription_updated_canceled_or_unpaid_expires(client, premium_active_user, status_value):
    payload = _event("customer.subscription.updated", {
        "customer": premium_active_user["stripe_customer_id"],
        "status": status_value,
    })
    resp = await client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": "t=1,v1=fake"})
    assert resp.status_code == 200

    doc = await motor_db.login.find_one({"username": premium_active_user["username"]})
    assert doc["premium_status"] == "expired"


async def test_subscription_updated_active_status_is_noop(client, premium_active_user):
    payload = _event("customer.subscription.updated", {
        "customer": premium_active_user["stripe_customer_id"],
        "status": "active",
    })
    resp = await client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": "t=1,v1=fake"})
    assert resp.status_code == 200

    doc = await motor_db.login.find_one({"username": premium_active_user["username"]})
    assert doc["premium_status"] == "active"


async def test_invalid_signature_rejected(client, monkeypatch):
    import stripe

    def _raise(*args, **kwargs):
        raise stripe.SignatureVerificationError("bad sig", "sig_header")

    monkeypatch.setattr(stripe.Webhook, "construct_event", _raise)

    resp = await client.post(
        "/billing/webhook",
        content=_event("checkout.session.completed", {"customer": "irrelevant"}),
        headers={"Stripe-Signature": "bad"},
    )
    assert resp.status_code == 403
