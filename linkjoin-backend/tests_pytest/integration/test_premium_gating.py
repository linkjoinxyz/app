"""Automates the manual curl verification done for require_premium against the
two real gated endpoints: attendance.py::get_my_rewards and ai.py::extract_meeting."""


async def test_rewards_403_when_trial_expired(as_user, premium_trial_expired_user):
    resp = await as_user(premium_trial_expired_user).get("/attendance/me/rewards")
    assert resp.status_code == 403


async def test_rewards_403_when_no_trial(as_user, personal_user_no_trial):
    resp = await as_user(personal_user_no_trial).get("/attendance/me/rewards")
    assert resp.status_code == 403


async def test_rewards_200_when_trial_active(as_user, premium_trial_active_user):
    resp = await as_user(premium_trial_active_user).get("/attendance/me/rewards")
    assert resp.status_code == 200


async def test_rewards_200_when_premium_active(as_user, premium_active_user):
    resp = await as_user(premium_active_user).get("/attendance/me/rewards")
    assert resp.status_code == 200


async def test_rewards_200_for_institutional_regardless_of_premium_status(as_user, institutional_teacher_user):
    resp = await as_user(institutional_teacher_user).get("/attendance/me/rewards")
    assert resp.status_code == 200


async def test_extract_meeting_403_when_trial_expired(as_user, premium_trial_expired_user):
    resp = await as_user(premium_trial_expired_user).post(
        "/ai/extract-meeting",
        json={"subject": "Team standup", "body": "Join at meet.google.com/abc-def", "user_timezone": "UTC"},
    )
    assert resp.status_code == 403
