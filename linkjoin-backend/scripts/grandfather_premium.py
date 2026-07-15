"""One-time: grant permanent grandfathered Premium to every pre-launch personal
account. Run once, manually, after deploying the Premium code (so any
account created during the deploy race already has premium_status: "trial" from
the updated signup routes and is correctly skipped by the $exists filter below).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings


async def main():
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_database]
    now = datetime.now(timezone.utc)

    result = await db.login.update_many(
        {"account_type": "personal", "premium_status": {"$exists": False}},
        {"$set": {
            "premium_status": "grandfathered",
            "premium_since": now,
            "grandfathered_note_seen": False,
        }},
    )
    print(f"Grandfathered {result.modified_count} pre-launch personal accounts.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
