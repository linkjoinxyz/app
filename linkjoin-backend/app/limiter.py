from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import get_settings

_redis_url = get_settings().redis_url

# Without shared storage every limit is counted per-process, and production runs
# 4 gunicorn workers (startup.sh), so a "5/minute" limit was really up to 20/min
# and reset on every restart. Redis is already a dependency and is provisioned in
# Azure; local dev and CI fall back to in-memory so they need no Redis running.
_is_local_default = not _redis_url or _redis_url.startswith("redis://localhost")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=None if _is_local_default else _redis_url,
    # Fail open. Moving storage to Redis put it on the critical path for every
    # limited endpoint, including all of /auth — without this a Redis blip turns
    # into a total login outage. Not rate limiting for the duration of an outage
    # is strictly better than being down.
    swallow_errors=True,
)
