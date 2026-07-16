"""PATCH /users/auto-delete and /users/vacation-mode must reject non-premium
users the same way /users/open-early already does - these flags aren't just
cosmetic, the scheduler acts on them (auto_delete_past_links, SMS reminder
skip), so letting a free account set them via a direct API call (e.g. after
stripping the settings-row-locked class client-side) would defeat the
server-side require_premium() gate entirely."""
from app.database import motor_db


async def test_auto_delete_rejects_non_premium_user(client, as_user, personal_user_no_trial):
    resp = await as_user(personal_user_no_trial).patch("/users/auto-delete", json={"enabled": True})
    assert resp.status_code == 403

    doc = await motor_db.login.find_one({"username": personal_user_no_trial["username"]})
    assert not doc.get("auto_delete_past")


async def test_vacation_mode_rejects_non_premium_user(client, as_user, personal_user_no_trial):
    resp = await as_user(personal_user_no_trial).patch("/users/vacation-mode", json={"enabled": True})
    assert resp.status_code == 403

    doc = await motor_db.login.find_one({"username": personal_user_no_trial["username"]})
    assert not doc.get("vacation_mode")


async def test_non_premium_user_can_still_turn_features_off(client, as_user, personal_user_no_trial):
    """Disabling a premium feature must never require premium - only enabling it."""
    resp = await as_user(personal_user_no_trial).patch("/users/auto-delete", json={"enabled": False})
    assert resp.status_code == 200

    resp = await as_user(personal_user_no_trial).patch("/users/vacation-mode", json={"enabled": False})
    assert resp.status_code == 200


async def test_premium_user_can_enable_both_features(client, as_user, premium_active_user):
    resp = await as_user(premium_active_user).patch("/users/auto-delete", json={"enabled": True})
    assert resp.status_code == 200

    resp = await as_user(premium_active_user).patch("/users/vacation-mode", json={"enabled": True})
    assert resp.status_code == 200

    doc = await motor_db.login.find_one({"username": premium_active_user["username"]})
    assert doc.get("auto_delete_past") is True
    assert doc.get("vacation_mode") is True
