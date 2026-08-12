"""Pure logic — no DB, no HTTP. require_premium is a plain function taking a dict."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.roles import require_premium


def test_institutional_always_entitled():
    require_premium({"account_type": "institutional", "premium_status": "expired"})


def test_active_entitled():
    require_premium({"account_type": "personal", "premium_status": "active"})


def test_grandfathered_entitled():
    require_premium({"account_type": "personal", "premium_status": "grandfathered"})


def test_trial_not_yet_expired_entitled():
    require_premium({
        "account_type": "personal",
        "premium_status": "trial",
        "trial_end": datetime.now(timezone.utc) + timedelta(days=1),
    })


def test_trial_expired_denied():
    with pytest.raises(HTTPException) as exc:
        require_premium({
            "account_type": "personal",
            "premium_status": "trial",
            "trial_end": datetime.now(timezone.utc) - timedelta(days=1),
        })
    assert exc.value.status_code == 403


def test_expired_status_denied():
    with pytest.raises(HTTPException) as exc:
        require_premium({"account_type": "personal", "premium_status": "expired"})
    assert exc.value.status_code == 403


def test_missing_premium_status_defaults_to_expired_denied():
    with pytest.raises(HTTPException) as exc:
        require_premium({"account_type": "personal"})
    assert exc.value.status_code == 403


def test_trial_with_no_trial_end_denied():
    with pytest.raises(HTTPException):
        require_premium({"account_type": "personal", "premium_status": "trial"})


# --- Unverified self-serve orgs -----------------------------------------------
# Anyone can tick "I'm a school" at signup, and account_type "institutional"
# bypasses billing entirely. Without a gate that is unlimited free Premium on an
# unchecked claim, so entitlement falls back to the ordinary trial rules until
# staff verify the org.


def test_unverified_institutional_falls_back_to_trial_rules():
    """org_verified False is not a denial by itself — a live trial still counts."""
    require_premium({
        "account_type": "institutional",
        "org_verified": False,
        "premium_status": "trial",
        "trial_end": datetime.now(timezone.utc) + timedelta(days=3),
    })


def test_unverified_institutional_denied_once_trial_expires():
    """The leak this closes: institutional alone used to mean entitled forever."""
    with pytest.raises(HTTPException) as exc:
        require_premium({
            "account_type": "institutional",
            "org_verified": False,
            "premium_status": "trial",
            "trial_end": datetime.now(timezone.utc) - timedelta(days=1),
        })
    assert exc.value.status_code == 403


def test_verified_institutional_entitled_regardless_of_status():
    require_premium({
        "account_type": "institutional",
        "org_verified": True,
        "premium_status": "expired",
    })


def test_missing_org_verified_stays_entitled():
    """Fail open, like auth.is_confirmed. Every institutional account that
    predates verification has no such field and must not be downgraded — this is
    what lets the gate ship without a migration."""
    require_premium({"account_type": "institutional", "premium_status": "expired"})
