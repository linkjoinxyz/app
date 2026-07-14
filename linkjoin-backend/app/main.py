import asyncio
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
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
from app.routers import auth, links, bookmarks, users, admin, messaging, ai, contact, orgs, classes, attendance, interventions, integrations, invites, parent, consent, mfa, incidents, status

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure hot-path indexes exist (idempotent)
    await motor_db.links.create_index("username")
    await motor_db.links.create_index("share_token", sparse=True)
    await motor_db.links.create_index([("username", 1), ("id", 1)])
    await motor_db.links.create_index("share_id", sparse=True)
    await motor_db.links.create_index("slug", unique=True, sparse=True)
    await motor_db.login.create_index("username")
    await motor_db.bookmarks.create_index("username")
    await motor_db.bookmarks.create_index([("username", 1), ("id", 1)])
    await motor_db.pending_links.create_index("username")
    await motor_db.deleted_links.create_index("username")
    await motor_db.audit_logs.create_index([("user", 1), ("ts", -1)])
    await motor_db.audit_logs.create_index([("user", 1), ("resource_type", 1), ("ts", -1)])
    await motor_db.audit_logs.create_index("ts")
    # TTL: audit logs expire after 730 days (24 months per DPA)
    try:
        await motor_db.audit_logs.create_index("ts", expireAfterSeconds=63072000, name="ts_ttl_730d")
    except Exception:
        pass
    # TTL: MFA challenges expire after 10 minutes
    try:
        await motor_db.mfa_challenges.create_index("created_at", expireAfterSeconds=600, name="mfa_ttl_10m")
        await motor_db.mfa_challenges.create_index("user_id")
    except Exception:
        pass
    await motor_db.login.create_index("user_id", unique=True, sparse=True)
    await motor_db.classes.create_index("class_id", unique=True)
    await motor_db.classes.create_index("org_id")
    await motor_db.classes.create_index("teacher_id")
    await motor_db.orgs.create_index("org_id", unique=True)
    await motor_db.attendance.create_index([("class_id", 1), ("opened_at", -1)])
    await motor_db.attendance.create_index("student_email")
    await motor_db.attendance.create_index([("class_id", 1), ("student_email", 1), ("source", 1), ("opened_at", -1)])
    await motor_db.interventions.create_index("intervention_id", unique=True)
    await motor_db.interventions.create_index([("org_id", 1), ("status", 1)])
    await motor_db.interventions.create_index([("class_id", 1), ("status", 1)])
    await motor_db.absence_alerts.create_index(
        [("class_id", 1), ("student_email", 1), ("date", 1)], unique=True
    )
    await motor_db.open_log.create_index([("username", 1), ("opened_at", -1)])
    await motor_db.open_log.create_index([("username", 1), ("link_id", 1), ("opened_at", -1)])
    await motor_db.invites.create_index("token", unique=True)
    await motor_db.invites.create_index([("org_id", 1), ("created_at", -1)])
    await motor_db.invites.create_index([("class_id", 1), ("type", 1), ("status", 1)])
    await motor_db.analytics_events.create_index([("event", 1), ("ym", 1)])
    await motor_db.analytics_events.create_index("ts")
    # Missing indexes surfaced by load test analysis
    await motor_db.login.create_index("org_id", sparse=True)
    await motor_db.login.create_index("parental_consent.token", sparse=True)
    await motor_db.parent_links.create_index("parent_user_id")
    await motor_db.parent_links.create_index("student_user_id")
    await motor_db.integrations.create_index([("org_id", 1), ("provider", 1)])
    await motor_db.integrations.create_index([("user_id", 1), ("provider", 1)])
    await motor_db.classes.create_index("student_ids")
    await motor_db.incidents.create_index("status")
    await motor_db.incidents.create_index("started_at")
    await motor_db.status_checks.create_index("ts")
    try:
        await motor_db.status_checks.create_index("ts", expireAfterSeconds=7948800, name="status_checks_ttl_92d")
    except Exception:
        pass

    async for u in motor_db.login.find({"user_id": {"$exists": False}}):
        await motor_db.login.update_one(
            {"_id": u["_id"]},
            {"$set": {"user_id": secrets.token_urlsafe(16), "account_type": "personal"}}
        )

    async def _init_scheduler():
        await asyncio.to_thread(load_all_text_jobs)
        scheduler.start()

    asyncio.create_task(_init_scheduler())
    yield
    scheduler.shutdown()


app = FastAPI(title="LinkJoin API", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
_origins = [_settings.frontend_url, "http://localhost:5173"]
if _settings.frontend_url.startswith("https://"):
    _bare = _settings.frontend_url.replace("https://", "")
    _origins += [f"https://www.{_bare}", f"https://{_bare}"]

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
