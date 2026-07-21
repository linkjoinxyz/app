"""Backfill `user_id` and `account_type` on login docs that predate those fields.

This ran inline in app.main's lifespan on every boot: an unfiltered scan of the
whole login collection, executed by all four gunicorn workers simultaneously, to
repair rows that a one-off migration handles once. Every restart paid for it, and
the four workers raced each other to assign ids to the same documents.

Idempotent -- only touches docs with no user_id.

    python scripts/backfill_user_ids.py [--dry-run]
"""
import asyncio
import os
import secrets
import sys

# Python puts this script's own directory (scripts/) on sys.path, not the cwd.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import motor_db  # noqa: E402


async def main(dry_run: bool) -> None:
    filled = 0
    async for doc in motor_db.login.find({"user_id": {"$exists": False}}, {"_id": 1}):
        if not dry_run:
            await motor_db.login.update_one(
                # Re-assert the filter so two concurrent runs cannot both assign
                # an id to the same document.
                {"_id": doc["_id"], "user_id": {"$exists": False}},
                {"$set": {"user_id": secrets.token_urlsafe(16), "account_type": "personal"}},
            )
        filled += 1

    verb = "would backfill" if dry_run else "backfilled"
    print(f"{verb} user_id on {filled} login document(s)")


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
