"""Backfill `share_token` on link docs that predate the field.

GET /links/addlink used to fall back to scanning every link with a `share` field
and Fernet-decrypting each one when the indexed lookup missed. That made a cache
miss O(n) in queries and crypto, so anyone could saturate the workers by
requesting a nonexistent id in a loop. The fallback is gone; this backfills the
docs it used to cover, once.

Idempotent — safe to re-run. Only touches docs that have `share` and lack
`share_token`.

    python scripts/backfill_share_tokens.py [--dry-run]
"""
import asyncio
import sys

from app.database import motor_db
from app.encryption import decrypt


async def main(dry_run: bool) -> None:
    filled = skipped = 0
    async for doc in motor_db.links.find({"share": {"$exists": True}, "share_token": {"$exists": False}}):
        try:
            token = decrypt(doc["share"]).split("?id=")[-1]
        except Exception:
            skipped += 1
            continue
        if not token:
            skipped += 1
            continue
        if not dry_run:
            await motor_db.links.update_one({"_id": doc["_id"]}, {"$set": {"share_token": token}})
        filled += 1

    verb = "would backfill" if dry_run else "backfilled"
    print(f"{verb} {filled} share_token values; skipped {skipped} undecryptable/empty")


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
