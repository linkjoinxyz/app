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
