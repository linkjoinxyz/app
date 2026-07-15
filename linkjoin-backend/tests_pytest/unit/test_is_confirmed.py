"""Pure logic — no DB, no HTTP. is_confirmed is a plain function taking a dict."""
from app.auth import is_confirmed


def test_missing_field_treated_as_confirmed():
    # Accounts predating the confirmation feature have no "confirmed" key at all.
    assert is_confirmed({"username": "legacy@example.com"}) is True


def test_explicit_true_confirmed():
    assert is_confirmed({"confirmed": "true"}) is True


def test_explicit_false_not_confirmed():
    assert is_confirmed({"confirmed": "false"}) is False
