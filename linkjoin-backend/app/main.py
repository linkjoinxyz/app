import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger(__name__)
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import get_settings
from app.limiter import limiter
from app.scheduler import scheduler, load_all_text_jobs
from app.auth import get_confirmed_user, create_token, decode_token
from app.utils import configure_data
from app.websocket_manager import manager
from app.database import motor_db
from app.redis_client import get_redis
from app.routers import auth, links, bookmarks, users, admin, messaging, ai, contact, orgs, classes, attendance, interventions, integrations, invites, parent, consent, mfa, incidents, status, billing

_DIST = Path(__file__).resolve().parent.parent.parent / "linkjoin-frontend" / "dist"

_settings = get_settings()

if _settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    sentry_sdk.init(
        dsn=_settings.sentry_dsn,
        environment=_settings.environment,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

def strip_port(host: str) -> str:
    """Drop a trailing :port from a forwarded client address.

    Azure App Service writes the source PORT into the client entry of
    X-Forwarded-For ("203.0.113.5:54321"), and uvicorn's ProxyHeadersMiddleware
    passes that entry through verbatim. Left alone, request.client.host varies per
    connection, so the rate limiter (keyed on get_remote_address) hands every
    single request its own bucket and stops limiting anything at all -- worse than
    the pre-fix behaviour of bucketing everyone together.
    """
    if not host:
        return host
    if host.startswith("["):  # [::1]:443 -> ::1
        end = host.find("]")
        return host[1:end] if end != -1 else host
    # A bare IPv6 address has several colons and no port; only strip when there is
    # exactly one, which is the IPv4:port form.
    if host.count(":") == 1:
        return host.split(":", 1)[0]
    return host


class NormalizeClientIPMiddleware:
    """Pure-ASGI so it can rewrite scope['client'] before routing.

    Runs inside uvicorn's ProxyHeadersMiddleware, so it sees the already
    forwarded-for-derived client and normalizes it once for everything
    downstream: the rate limiter and the audit log both read request.client.host.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            client = scope.get("client")
            if client and isinstance(client[0], str):
                host = strip_port(client[0])
                if host != client[0]:
                    scope = dict(scope)
                    scope["client"] = (host, client[1])
        return await self.app(scope, receive, send)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://accounts.google.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' wss: https://accounts.google.com; "
            "frame-src https://accounts.google.com"
        )
        # Azure/Vercel terminate TLS at the load balancer; trust X-Forwarded-Proto
        is_https = (
            request.url.scheme == "https"
            or request.headers.get("X-Forwarded-Proto") == "https"
        )
        if is_https:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


async def _soft_index(*coros) -> None:
    """Run index-creation coroutines that may legitimately conflict with an
    existing index (e.g. TTL params changed) — swallow so one bad index
    doesn't block the others.

    Each coroutine is isolated. They used to share one try block, so a conflict on
    the first silently skipped every later one in the same call (the
    mfa_challenges.user_id index was never created for this reason). Failures are
    logged rather than passed: a swallowed exception here means an index is simply
    absent, which is invisible until something is slow or a uniqueness constraint
    turns out not to exist.
    """
    for coro in coros:
        try:
            await coro
        except Exception as exc:
            log.warning("[startup] index creation skipped: %s", exc)


async def _ensure_unique_username_index() -> None:
    """Migrate login.username from the non-unique username_1 index to a unique one.

    MongoDB rejects a second index on the same key pattern even under a different
    name, so the non-unique index has to be dropped before the unique one can be
    built (a sub-millisecond window at boot with no username index). Idempotent:
    returns immediately once a unique index on username exists, so re-runs and
    fresh databases are no-ops. A failed build — a duplicate slipped in — is
    logged loudly rather than swallowed, since a silently-absent uniqueness
    constraint is exactly what let the duplicates accumulate.
    """
    info = await motor_db.login.index_information()
    if any(spec.get("key") == [("username", 1)] and spec.get("unique") for spec in info.values()):
        return  # already migrated
    for name, spec in info.items():
        if spec.get("key") == [("username", 1)] and not spec.get("unique"):
            try:
                await motor_db.login.drop_index(name)
            except Exception as exc:
                log.warning("[startup] could not drop non-unique username index %s: %s", name, exc)
    try:
        await motor_db.login.create_index("username", unique=True, name="username_unique")
        log.info("[startup] built unique index on login.username")
    except Exception as exc:
        log.error(
            "[startup] could not build unique index on login.username "
            "(duplicates present?): %s", exc,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure hot-path indexes exist (idempotent). Independent, so run concurrently
    # instead of one round-trip at a time — this used to serialize ~46 index
    # checks on every cold start.
    #
    # Gathered with return_exceptions=True below, because a failed index must
    # never stop the app from booting. It previously could: a bare
    # create_index("ts") sitting alongside a TTL index on the same key raises
    # IndexOptionsConflict depending on which was created first, and that escaped
    # the gather and killed startup outright. A missing index is a slow query; a
    # refusal to boot is an outage.
    _index_coros = (
        motor_db.links.create_index("username"),
        motor_db.links.create_index("share_token", sparse=True),
        motor_db.links.create_index([("username", 1), ("id", 1)]),
        motor_db.links.create_index("share_id", sparse=True),
        motor_db.links.create_index("slug", unique=True, sparse=True),
        # login.username used to be a plain index (username_1); a concurrent-signup
        # race could insert two docs for one email, after which every
        # find_one({"username"}) returned an arbitrary one. This migrates it to
        # unique. create_index cannot alter an existing index's options in place
        # (IndexOptionsConflict), so build the unique one under a new name, then
        # drop the old non-unique one. Idempotent and boot-safe.
        _ensure_unique_username_index(),
        motor_db.bookmarks.create_index("username"),
        motor_db.bookmarks.create_index([("username", 1), ("id", 1)]),
        motor_db.pending_links.create_index("username"),
        motor_db.deleted_links.create_index("username"),
        motor_db.audit_logs.create_index([("user", 1), ("ts", -1)]),
        motor_db.audit_logs.create_index([("user", 1), ("resource_type", 1), ("ts", -1)]),
        # TTL: audit logs expire after 730 days (24 months per DPA). This also
        # serves as the plain index on ts; declaring a bare one too conflicts.
        _soft_index(motor_db.audit_logs.create_index("ts", expireAfterSeconds=63072000, name="ts_ttl_730d")),
        # TTL: MFA challenges expire after 10 minutes
        _soft_index(
            motor_db.mfa_challenges.create_index("created_at", expireAfterSeconds=600, name="mfa_ttl_10m"),
            motor_db.mfa_challenges.create_index("user_id"),
        ),
        motor_db.login.create_index("user_id", unique=True, sparse=True),
        motor_db.classes.create_index("class_id", unique=True),
        motor_db.classes.create_index("org_id"),
        motor_db.classes.create_index("teacher_id"),
        motor_db.orgs.create_index("org_id", unique=True),
        motor_db.orgs.create_index("parent_org_id", sparse=True),
        motor_db.attendance.create_index([("class_id", 1), ("opened_at", -1)]),
        motor_db.attendance.create_index("student_email"),
        motor_db.attendance.create_index([("class_id", 1), ("student_email", 1), ("source", 1), ("opened_at", -1)]),
        motor_db.interventions.create_index("intervention_id", unique=True),
        motor_db.interventions.create_index([("org_id", 1), ("status", 1)]),
        motor_db.interventions.create_index([("class_id", 1), ("status", 1)]),
        motor_db.absence_alerts.create_index(
            [("class_id", 1), ("student_email", 1), ("date", 1)], unique=True
        ),
        motor_db.parent_reminder_log.create_index(
            [("class_id", 1), ("student_user_id", 1), ("parent_user_id", 1), ("date", 1)], unique=True
        ),
        motor_db.open_log.create_index([("username", 1), ("opened_at", -1)]),
        motor_db.open_log.create_index([("username", 1), ("link_id", 1), ("opened_at", -1)]),
        motor_db.invites.create_index("token", unique=True),
        motor_db.invites.create_index([("org_id", 1), ("created_at", -1)]),
        motor_db.invites.create_index([("class_id", 1), ("type", 1), ("status", 1)]),
        motor_db.analytics_events.create_index([("event", 1), ("ym", 1)]),
        motor_db.analytics_events.create_index("ts"),
        # Missing indexes surfaced by load test analysis
        motor_db.login.create_index("org_id", sparse=True),
        motor_db.login.create_index("parental_consent.token", sparse=True),
        motor_db.parent_links.create_index("parent_user_id"),
        motor_db.parent_links.create_index("student_user_id"),
        motor_db.integrations.create_index([("org_id", 1), ("provider", 1)]),
        motor_db.integrations.create_index([("user_id", 1), ("provider", 1)]),
        motor_db.classes.create_index("student_ids"),
        motor_db.incidents.create_index("status"),
        motor_db.incidents.create_index("started_at"),
        # Doubles as the plain ts index, as above.
        _soft_index(
            motor_db.status_checks.create_index("ts", expireAfterSeconds=7948800, name="status_checks_ttl_92d")
        ),
        motor_db.login.create_index("stripe_customer_id", sparse=True),
        # TTL: processed Stripe webhook event ids expire after 92 days (dedupe window)
        _soft_index(
            motor_db.stripe_webhook_events.create_index(
                "inserted_at", expireAfterSeconds=7948800, name="stripe_webhook_events_ttl_92d"
            )
        ),
    )
    for _result in await asyncio.gather(*_index_coros, return_exceptions=True):
        if isinstance(_result, Exception):
            log.warning("[startup] index creation failed: %s", _result)

    # NOTE: the user_id backfill that used to live here has moved to
    # scripts/backfill_user_ids.py. It scanned the whole login collection on every
    # boot, in all four gunicorn workers simultaneously, to fix rows that a one-off
    # migration handles once.

    from app.scheduler import run_leader_loop

    def _log_task_exception(task: asyncio.Task) -> None:
        """A bare create_task swallows the traceback: if scheduler init raised,
        no jobs ran and nothing said so."""
        if task.cancelled():
            return
        if task.exception() is not None:
            log.error("[scheduler] leader loop exited unexpectedly", exc_info=task.exception())

    _leader_task = asyncio.create_task(run_leader_loop(load_all_text_jobs))
    _leader_task.add_done_callback(_log_task_exception)
    yield
    _leader_task.cancel()
    if scheduler.running:
        scheduler.shutdown()
    from app.scheduler import release_leadership
    await release_leadership()


app = FastAPI(title="LinkJoin API", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
# Added last so it wraps outermost of the app-level stack, i.e. the client is
# normalized before the rate limiter or any handler reads it.
app.add_middleware(NormalizeClientIPMiddleware)
_origins = [_settings.frontend_url, "http://localhost:5173"]
if _settings.frontend_url.startswith("https://"):
    _bare = _settings.frontend_url.replace("https://", "")
    # Include the schools subdomain so IncidentBanner (mounted globally) can
    # fetch /incidents/active there; without it the banner never shows to the
    # school/district admins who have an SLA.
    _origins += [f"https://www.{_bare}", f"https://{_bare}", f"https://schools.{_bare}"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(_origins)),
    allow_origin_regex=r"^(chrome|moz)-extension://.*$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router)
app.include_router(links.router)
app.include_router(bookmarks.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(messaging.router)
app.include_router(ai.router)
app.include_router(contact.router)
app.include_router(orgs.router)
app.include_router(classes.router)
app.include_router(attendance.router)
app.include_router(interventions.router)
app.include_router(integrations.router)
app.include_router(invites.router)
app.include_router(parent.router)
app.include_router(consent.router)
app.include_router(mfa.router)
app.include_router(incidents.router)
app.include_router(status.router)
app.include_router(billing.router)


@app.get("/location")
async def location(cf_ipcountry: str | None = None):
    return {"country": cf_ipcountry}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    import time as _time
    result: dict = {"status": "ok", "mongo_ms": None, "redis_ms": None}
    degraded = False

    try:
        t0 = _time.monotonic()
        await motor_db.command("ping")
        result["mongo_ms"] = round((_time.monotonic() - t0) * 1000, 1)
    except Exception as e:
        result["mongo_ms"] = None
        result["mongo_error"] = str(e)
        degraded = True

    try:
        redis = await get_redis()
        t1 = _time.monotonic()
        await redis.ping()
        result["redis_ms"] = round((_time.monotonic() - t1) * 1000, 1)
    except Exception as e:
        result["redis_ms"] = None
        result["redis_error"] = str(e)
        degraded = True

    if degraded:
        result["status"] = "degraded"
        return JSONResponse(status_code=503, content=result)
    return result


@app.get("/ws-ticket")
@limiter.limit("20/minute")
async def ws_ticket(request: Request, user: dict = Depends(get_confirmed_user)):
    ticket = create_token(user["username"], minutes=1, extra={"purpose": "ws"})
    return {"ticket": ticket}


if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        candidate = (_DIST / full_path).resolve()
        if not candidate.is_relative_to(_DIST.resolve()):
            return FileResponse(_DIST / "index.html")
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")


@app.websocket("/ws/database")
async def database_ws(websocket: WebSocket, ticket: str = Query(...)):
    try:
        payload = decode_token(ticket)
        if payload.get("purpose") != "ws":
            raise ValueError("wrong purpose")
        email = payload.get("sub")
        if not email:
            raise ValueError("no sub")
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, email)
    try:
        await manager.broadcast(await configure_data(email), email)
    except Exception:
        manager.disconnect(websocket, email)
        return

    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, ConnectionError, Exception):
        manager.disconnect(websocket, email)
