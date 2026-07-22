"""The access-token lifetime is coupled to the SHIPPED browser extension.

Cutting access_token_expire_minutes from 7 days to 60 minutes broke every
installed extension in production. The published build reads `token` from the
page and returns null on a 401 with no refresh path, so it stopped working 60
minutes after the user last opened the web app. The refresh support lives in
linkjoin-extension/ but only reaches users through a Chrome Web Store update.

This guards the ordering: the TTL may only be shortened once the extension that
can renew a token is the one users actually have.
"""
import pathlib
import re

import pytest

from app.config import get_settings

_EXT = pathlib.Path(__file__).resolve().parents[2].parent / "linkjoin-extension"
# Below this, an extension with no refresh path cannot survive between visits.
_SAFE_FLOOR_MINUTES = 1440


def _extension_source_can_refresh() -> bool:
    bg = _EXT / "background.js"
    sync = _EXT / "lj-auth-sync.js"
    if not bg.exists() or not sync.exists():
        return False
    return "auth/refresh" in bg.read_text() and "refresh_token" in sync.read_text()


def test_extension_source_still_has_refresh_support():
    """If this goes red, the refresh path was removed and the TTL guard below
    is no longer meaningful."""
    assert _extension_source_can_refresh()


def test_short_token_ttl_requires_a_shipped_extension_that_can_refresh():
    ttl = get_settings().access_token_expire_minutes
    if ttl >= _SAFE_FLOOR_MINUTES:
        pytest.skip(f"TTL is {ttl}m, long enough for a refresh-less extension")

    # Shortening the TTL is only safe once users actually have the new build, so
    # the packaged manifest version must have moved past the one that shipped
    # without refresh support.
    manifest = _EXT / "manifest.json"
    version = re.search(r'"version"\s*:\s*"([^"]+)"', manifest.read_text()).group(1)
    assert version != "0.3.3", (
        f"access_token_expire_minutes is {ttl}m but the extension is still "
        f"v{version}, the build with no refresh path. Publish the new extension "
        "and let it reach installs before shortening the token lifetime."
    )
