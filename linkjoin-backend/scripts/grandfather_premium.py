"""One-time: grant permanent grandfathered Premium to every pre-launch personal
account. Run once, manually, after deploying the Premium code (so any
account created during the deploy race already has premium_status: "trial" from
the updated signup routes and is correctly skipped by the $exists filter below).

This was never actually run after the Premium deploy, which left ~2400 pre-launch
personal accounts with no premium_status at all. roles.is_premium reads a missing
premium_status as "expired", so every one of them got a 403 from require_premium
on email scanning, calendar import, auto-delete and vacation mode. It surfaces to
the user as "the feature is broken", not as a billing problem, so it went
unreported.

Idempotent: the $exists filter only matches accounts that have never had a
premium_status, so re-running skips anyone already on trial/active/expired.

    python scripts/grandfather_premium.py --dry-run   # report only, writes nothing
    python scripts/grandfather_premium.py             # apply
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from app.config import get_settings  # noqa: E402

TARGET = {"account_type": "personal", "premium_status": {"$exists": False}}


async def main(dry_run: bool) -> None:
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_database]
    now = datetime.now(timezone.utc)

    print(f"database: {settings.mongo_database}")
    print()

    # Where every personal account stands right now.
    total = await db.login.count_documents({"account_type": "personal"})
    to_change = await db.login.count_documents(TARGET)
    print(f"personal accounts: {total}")
    for status in ("grandfathered", "active", "trial", "expired"):
        n = await db.login.count_documents({"account_type": "personal", "premium_status": status})
        print(f"  premium_status={status:<14} {n}")
    print(f"  premium_status MISSING       {to_change}   <- would be granted")
    print()

    # Anything with billing history is worth eyeballing before a bulk write, in
    # case a real subscription is involved. Named, not just counted.
    billing = [
        u async for u in db.login.find(
            {**TARGET, "$or": [
                {"stripe_customer_id": {"$exists": True, "$ne": None}},
                {"stripe_subscription_id": {"$exists": True, "$ne": None}},
            ]},
            {"username": 1, "stripe_customer_id": 1, "stripe_subscription_id": 1, "_id": 0},
        )
    ]
    if billing:
        print(f"in scope AND has Stripe history ({len(billing)}) — check before applying:")
        for u in billing:
            print(f"  {u['username']}  customer={u.get('stripe_customer_id')} "
                  f"subscription={u.get('stripe_subscription_id')}")
    else:
        print("in scope with Stripe history: none")
    print()

    if dry_run:
        print(f"DRY RUN — would set premium_status=grandfathered on {to_change} account(s).")
        print("Re-run without --dry-run to apply.")
        client.close()
        return

    result = await db.login.update_many(TARGET, {"$set": {
        "premium_status": "grandfathered",
        "premium_since": now,
        "grandfathered_note_seen": False,
    }})
    print(f"Grandfathered {result.modified_count} pre-launch personal accounts.")
    remaining = await db.login.count_documents(TARGET)
    print(f"still missing premium_status: {remaining} (expected 0)")
    client.close()


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
