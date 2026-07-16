"""One-time: mark every pre-existing account as having already seen the new
trial-welcome modal, so it only shows to genuinely new signups going forward.
Run once, manually, after deploying the trial-welcome code (so any account
created during the deploy race already has trial_welcome_seen: False from the
updated signup routes and is correctly skipped by the $exists filter below).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings


async def main():
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_database]

    result = await db.login.update_many(
        {"trial_welcome_seen": {"$exists": False}},
        {"$set": {"trial_welcome_seen": True}},
    )
    print(f"Marked {result.modified_count} pre-existing accounts as trial_welcome_seen.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
