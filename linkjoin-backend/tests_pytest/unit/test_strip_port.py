"""Azure App Service puts the source port in the client entry of X-Forwarded-For,
and uvicorn's ProxyHeadersMiddleware passes it through unchanged. If that reaches
request.client.host, the rate limiter keys on a value that changes every
connection and stops limiting anything.
"""
import pytest

from app.main import strip_port


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("203.0.113.5:54321", "203.0.113.5"),  # what Azure actually sends
        ("203.0.113.5", "203.0.113.5"),
        ("[2001:db8::1]:443", "2001:db8::1"),  # bracketed IPv6 with port
        ("2001:db8::1", "2001:db8::1"),        # bare IPv6 must survive intact
        ("::1", "::1"),
        ("", ""),
    ],
)
def test_strip_port(raw, expected):
    assert strip_port(raw) == expected


def test_ipv4_rate_limit_key_is_stable_across_ports():
    """The actual point: two requests from one client must share a bucket."""
    assert strip_port("203.0.113.5:1111") == strip_port("203.0.113.5:2222")
