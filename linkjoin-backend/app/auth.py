import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import get_settings
from app.database import motor_db
from app.redis_client import get_redis

_settings = get_settings()
_bearer = HTTPBearer(auto_error=False)


def create_token(sub: str, minutes: int | None = None, extra: dict | None = None) -> str:
    expire_minutes = minutes if minutes is not None else _settings.access_token_expire_minutes
    payload = {
        "sub": sub,
        "jti": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _settings.jwt_secret, algorithms=[_settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)

    jti = payload.get("jti")
    if jti:
        try:
            if await get_redis().exists(f"jti:{jti}"):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
        except HTTPException:
            raise
        except Exception:
            pass

    email: str = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await motor_db.login.find_one({"username": email}, {"password": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Attach JTI and exp so endpoints (e.g. logout) can blacklist the token
    user["_jti"] = jti
    user["_exp"] = payload.get("exp")
    return user


async def get_confirmed_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("confirmed") != "true":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not confirmed")
    return user
