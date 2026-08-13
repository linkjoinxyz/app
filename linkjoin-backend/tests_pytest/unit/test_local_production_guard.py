"""A local process must not be able to attach to the production database."""
import pytest
from pydantic import ValidationError

from app import config


def _settings(monkeypatch, *, local: bool, **env):
    monkeypatch.setattr(config, "running_locally", lambda: local)
    for k, v in {"MONGO_URI": "mongodb://localhost:27017", "JWT_SECRET": "x",
                 "ENCRYPT_KEY": "x", "GMAIL_PWD": "x", **env}.items():
        monkeypatch.setenv(k, v)
    return config.Settings(_env_file=None)


def test_local_process_refuses_the_production_database(monkeypatch):
    with pytest.raises(ValidationError, match="Refusing to start"):
        _settings(monkeypatch, local=True, MONGO_DATABASE=config.PRODUCTION_DATABASE)


def test_local_process_with_its_own_database_is_fine(monkeypatch):
    s = _settings(monkeypatch, local=True, MONGO_DATABASE="linkjoin_localdev")
    assert s.mongo_database == "linkjoin_localdev"


def test_escape_hatch_allows_it_explicitly(monkeypatch):
    s = _settings(monkeypatch, local=True, MONGO_DATABASE=config.PRODUCTION_DATABASE,
                  ALLOW_PRODUCTION_DATABASE="true")
    assert s.mongo_database == config.PRODUCTION_DATABASE


def test_deployed_process_uses_the_production_database(monkeypatch):
    # No .env in the image, so the guard must never fire there.
    s = _settings(monkeypatch, local=False, MONGO_DATABASE=config.PRODUCTION_DATABASE)
    assert s.mongo_database == config.PRODUCTION_DATABASE


def test_scheduler_is_off_locally_by_default(monkeypatch):
    assert _settings(monkeypatch, local=True).run_scheduler_locally is False
