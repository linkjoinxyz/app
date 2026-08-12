import logging
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import HTTPException
from app.config import get_settings

log = logging.getLogger(__name__)

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


# --- Per-account throttling ---------------------------------------------------
# The limiter above keys on source IP, which is the wrong unit for a school:
# a whole building NATs to one address, so a class of 30 signing in at the bell
# looked identical to one attacker and most of them got 429s. The per-IP limits
# are therefore a coarse abuse ceiling, and the real guessing bound is here,
# keyed on the account being targeted. 30 people behind one IP is normal; 20
# attempts against one account is not.
#
# Same idea as _MAX_VERIFY_ATTEMPTS in routers/mfa.py, applied to passwords.

async def check_account_rate_limit(account: str, action: str, limit: int, window_seconds: int) -> None:
    """Raise 429 when one account has been targeted too often in the window.

    Fails OPEN on any Redis error, matching swallow_errors above: a Redis blip
    must degrade abuse protection, never lock everyone out of logging in.
    """
    if not account:
        return
    key = f"acct_rl:{action}:{account.lower()}"
    try:
        from app.redis_client import get_redis

        redis = get_redis()
        count = await redis.incr(key)
        if count == 1:
            # Only the first hit sets the TTL, so the window is fixed from the
            # first attempt rather than sliding forward with every new one --
            # otherwise sustained guessing would keep the key alive forever.
            await redis.expire(key, window_seconds)
        if count > limit:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts for this account. Please try again shortly.",
            )
    except HTTPException:
        raise
    except Exception:
        log.warning("[ratelimit] account check unavailable for %s, allowing", action, exc_info=True)


async def clear_account_rate_limit(account: str, action: str) -> None:
    """Drop the counter after a success, so a legitimate user who mistyped a few
    times is not still throttled once they get it right."""
    if not account:
        return
    try:
        from app.redis_client import get_redis

        await get_redis().delete(f"acct_rl:{action}:{account.lower()}")
    except Exception:
        log.debug("[ratelimit] could not clear counter for %s", action, exc_info=True)
