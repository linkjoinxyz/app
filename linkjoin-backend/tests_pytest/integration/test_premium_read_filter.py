"""GET /users/me must not hand premium-only settings to non-entitled accounts.

Writing these is gated by require_premium, but nothing ever cleared them when a
trial lapsed, and the frontend (useAutoOpen.js) reads them straight off this
response with no entitlement check of its own. So every user who set Open Early
during their 14-day trial kept it forever.
"""
from app.database import motor_db

_PREMIUM_FIELDS = ("open_early", "vacation_mode", "auto_delete_past")


_SETTINGS = {"open_early": 15, "vacation_mode": True, "auto_delete_past": True}


async def _set_premium_settings(user: dict):
    """Write to both the document and the fixture dict.

    get_me operates on the user dict the auth dependency yields, and `as_user`
    injects the fixture dict directly — so a DB-only write would never reach the
    code under test. The DB write still matters for the persistence assertion.
    """
    await motor_db.login.update_one({"username": user["username"]}, {"$set": _SETTINGS})
    user.update(_SETTINGS)


async def test_lapsed_user_does_not_receive_premium_settings(client, as_user, personal_user_no_trial):
    await _set_premium_settings(personal_user_no_trial)

    resp = await as_user(personal_user_no_trial).get("/users/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == personal_user_no_trial["username"]
    for field in _PREMIUM_FIELDS:
        assert field not in body, f"{field} leaked to a non-entitled account"


async def test_expired_trial_does_not_receive_premium_settings(client, as_user, premium_trial_expired_user):
    await _set_premium_settings(premium_trial_expired_user)

    resp = await as_user(premium_trial_expired_user).get("/users/me")
    # Assert the status explicitly: on a 401 the body is {"detail": ...} and the
    # "field not in body" checks below would pass without testing anything.
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == premium_trial_expired_user["username"]
    for field in _PREMIUM_FIELDS:
        assert field not in body


async def test_active_subscriber_receives_premium_settings(client, as_user, premium_active_user):
    await _set_premium_settings(premium_active_user)

    body = (await as_user(premium_active_user).get("/users/me")).json()
    assert body["open_early"] == 15
    assert body["vacation_mode"] is True


async def test_active_trial_receives_premium_settings(client, as_user, premium_trial_active_user):
    await _set_premium_settings(premium_trial_active_user)

    body = (await as_user(premium_trial_active_user).get("/users/me")).json()
    assert body["open_early"] == 15


async def test_institutional_receives_premium_settings(client, as_user, institutional_teacher_user):
    """Institutional accounts carry no premium_status; entitlement comes from
    account_type. They must not be stripped."""
    await _set_premium_settings(institutional_teacher_user)

    body = (await as_user(institutional_teacher_user).get("/users/me")).json()
    assert body["open_early"] == 15


async def test_filtering_does_not_erase_the_stored_values(client, as_user, personal_user_no_trial):
    """Deliberate: the settings survive the lapse so resubscribing restores the
    user's configuration instead of making them redo it."""
    await _set_premium_settings(personal_user_no_trial)
    await as_user(personal_user_no_trial).get("/users/me")

    doc = await motor_db.login.find_one({"username": personal_user_no_trial["username"]})
    assert doc["open_early"] == 15
    assert doc["vacation_mode"] is True
