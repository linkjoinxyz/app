import logging
from datetime import datetime, timezone
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth import get_confirmed_user
from app.database import motor_db
from app.config import get_settings
from app.audit import log_audit

log = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])
_settings = get_settings()
stripe.api_key = _settings.stripe_secret_key


@router.post("/checkout")
async def create_checkout_session(user: dict = Depends(get_confirmed_user)):
    if not _settings.stripe_secret_key or not _settings.stripe_price_id:
        raise HTTPException(status_code=503, detail="Billing not configured")
    if user.get("premium_status") == "active":
        raise HTTPException(status_code=400, detail="Already subscribed")

    customer_id = user.get("stripe_customer_id")
    if not customer_id:
        customer = await stripe.Customer.create_async(
            email=user["username"], metadata={"user_id": user.get("user_id", "")}
        )
        customer_id = customer.id
        await motor_db.login.update_one(
            {"username": user["username"]}, {"$set": {"stripe_customer_id": customer_id}}
        )

    session = await stripe.checkout.Session.create_async(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": _settings.stripe_price_id, "quantity": 1}],
        success_url=f"{_settings.frontend_url}/settings?billing=success",
        cancel_url=f"{_settings.frontend_url}/settings?billing=cancel",
        client_reference_id=user.get("user_id", ""),
        automatic_tax={"enabled": True},
        customer_update={"address": "auto"},
    )
    return {"url": session.url}


@router.post("/portal")
async def create_portal_session(user: dict = Depends(get_confirmed_user)):
    if not _settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    customer_id = user.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No billing account yet")

    session = await stripe.billing_portal.Session.create_async(
        customer=customer_id, return_url=f"{_settings.frontend_url}/settings"
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, _settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status_code=403, detail="Invalid signature")

    raw_data = event["data"]["object"]
    data = raw_data.to_dict() if hasattr(raw_data, "to_dict") else raw_data
    event_type = event["type"]

    if event_type == "checkout.session.completed":
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")
        user = await motor_db.login.find_one({"stripe_customer_id": customer_id})
        if not user:
            client_ref = data.get("client_reference_id")
            user = await motor_db.login.find_one({"user_id": client_ref}) if client_ref else None
        if user:
            await motor_db.login.update_one(
                {"username": user["username"]},
                {"$set": {
                    "premium_status": "active",
                    "stripe_customer_id": customer_id,
                    "stripe_subscription_id": subscription_id,
                    "premium_since": datetime.now(timezone.utc),
                    "trial_start": None,
                    "trial_end": None,
                }},
            )
            await log_audit(user["username"], "billing.subscribed")
        else:
            log.warning("[billing] checkout.session.completed for unknown customer %s", customer_id)

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        user = await motor_db.login.find_one({"stripe_customer_id": customer_id})
        if user:
            await motor_db.login.update_one(
                {"username": user["username"]},
                {"$set": {"premium_status": "expired", "stripe_subscription_id": None}},
            )
            await log_audit(user["username"], "billing.canceled")

    elif event_type == "customer.subscription.updated":
        status = data.get("status")
        if status in ("canceled", "unpaid"):
            customer_id = data.get("customer")
            user = await motor_db.login.find_one({"stripe_customer_id": customer_id})
            if user:
                await motor_db.login.update_one(
                    {"username": user["username"]},
                    {"$set": {"premium_status": "expired", "stripe_subscription_id": None}},
                )
                await log_audit(user["username"], "billing.canceled")

    return {"received": True}
