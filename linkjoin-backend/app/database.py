from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from app.config import get_settings

_settings = get_settings()

# Clients are initialized lazily on first access so that importing this module
# doesn't trigger DNS resolution (which would fail before the .env is loaded).
_async_client: AsyncIOMotorClient | None = None
_sync_client: MongoClient | None = None


def _get_async_client() -> AsyncIOMotorClient:
    global _async_client
    if _async_client is None:
        _async_client = AsyncIOMotorClient(
            _settings.mongo_uri,
            maxPoolSize=20,
            minPoolSize=2,
        )
    return _async_client


def _get_sync_client() -> MongoClient:
    global _sync_client
    if _sync_client is None:
        # Scheduler only — one thread, small pool is fine
        _sync_client = MongoClient(_settings.mongo_uri, maxPoolSize=5)
    return _sync_client


class _LazyAsyncDB:
    """Proxy that forwards attribute access to the real Motor database on demand."""
    def __getattr__(self, name):
        return getattr(_get_async_client()[_settings.mongo_database], name)


class _LazySyncDB:
    """Proxy that forwards attribute access to the real PyMongo database on demand."""
    def __getattr__(self, name):
        return getattr(_get_sync_client()[_settings.mongo_database], name)

    def __getitem__(self, name):
        return _get_sync_client()[_settings.mongo_database][name]


motor_db = _LazyAsyncDB()
sync_db = _LazySyncDB()
