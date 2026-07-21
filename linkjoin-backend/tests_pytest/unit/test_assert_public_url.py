"""assert_public_url is the SSRF guard for user-supplied URLs the server fetches
(currently the org calendar iCal import). Without it, a school admin could point
the endpoint at 169.254.169.254 or localhost and reach cloud instance metadata
and internal services from inside the network.
"""
import pytest

from app.utils import assert_public_url, UnsafeURLError


@pytest.mark.parametrize(
    "url",
    [
        "https://169.254.169.254/latest/meta-data/",  # cloud instance metadata
        "https://127.0.0.1/x",
        "https://localhost/x",
        "https://10.0.0.1/x",
        "https://192.168.1.1/x",
        "https://172.16.0.1/x",
        "https://0.0.0.0/x",
        "https://[::1]/x",
    ],
)
def test_internal_addresses_are_rejected(url):
    with pytest.raises(UnsafeURLError):
        assert_public_url(url)


@pytest.mark.parametrize("url", ["http://example.com/cal.ics", "file:///etc/passwd", "gopher://example.com/"])
def test_non_https_schemes_are_rejected(url):
    with pytest.raises(UnsafeURLError):
        assert_public_url(url)


def test_unresolvable_host_is_rejected():
    with pytest.raises(UnsafeURLError):
        assert_public_url(f"https://no-such-host-{'x' * 20}.invalid/cal.ics")


def test_missing_host_is_rejected():
    with pytest.raises(UnsafeURLError):
        assert_public_url("https:///cal.ics")


def test_ordinary_public_url_is_allowed():
    assert_public_url("https://example.com/calendar.ics")
