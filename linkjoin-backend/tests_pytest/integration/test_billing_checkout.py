"""POST /billing/checkout eligibility gate (billing.py::create_checkout_session).
Only covers the pre-Stripe-call validation branches — institutional and
already-entitled users should be rejected before any Stripe API call is made."""


async def test_checkout_rejects_institutional_user(as_user, institutional_teacher_user):
    resp = await as_user(institutional_teacher_user).post("/billing/checkout")
    assert resp.status_code == 400


async def test_checkout_rejects_active_premium_user(as_user, premium_active_user):
    resp = await as_user(premium_active_user).post("/billing/checkout")
    assert resp.status_code == 400


async def test_checkout_rejects_grandfathered_user(as_user, personal_user_no_trial):
    personal_user_no_trial["premium_status"] = "grandfathered"
    resp = await as_user(personal_user_no_trial).post("/billing/checkout")
    assert resp.status_code == 400
