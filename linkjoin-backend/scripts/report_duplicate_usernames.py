"""Report duplicate `login` documents that share a username (email address).

login.username is indexed but NOT unique (app/main.py), and registration is an
unguarded check-then-insert (routers/auth.py), so two concurrent signups for the
same address both pass the check and both insert. Every later lookup is
find_one({"username": ...}), which returns an arbitrary one of the duplicates, so
which password authenticates and which role/org_id/premium_status applies can
diverge for the same person.

The fix is a unique index on login.username, but that index cannot be built while
duplicates exist. This script finds them and prints what each copy holds so the
reconciliation can be done by hand. It decides nothing and merges nothing.

READ-ONLY. It never writes. --dry-run is accepted and ignored, so that habitually
passing it changes nothing.

    python scripts/report_duplicate_usernames.py
"""
import asyncio
import os
import sys

# Python puts this script's own directory (scripts/) on sys.path, not the cwd, so
# `python scripts/report_duplicate_usernames.py` cannot import `app` without this.
# scripts/backfill_share_tokens.py omits it and does not actually run as documented.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import motor_db  # noqa: E402


async def _describe(doc: dict) -> dict:
    """Everything needed to decide which copy is the real account."""
    username = doc["username"]
    user_id = doc.get("user_id")
    return {
        "_id": str(doc["_id"]),
        "user_id": user_id,
        "has_password": bool(doc.get("password")),
        "role": doc.get("role"),
        "org_id": doc.get("org_id"),
        "account_type": doc.get("account_type"),
        "premium_status": doc.get("premium_status"),
        "confirmed": doc.get("confirmed"),
        "created_at": doc.get("created_at"),
        # Reference counts, so a copy with data attached is not deleted blindly.
        "links": await motor_db.links.count_documents({"username": username}),
        "attendance": await motor_db.attendance.count_documents({"student_email": username}),
        "classes_enrolled": (
            await motor_db.classes.count_documents({"student_ids": user_id}) if user_id else 0
        ),
        "parent_links": (
            await motor_db.parent_links.count_documents(
                {"$or": [{"parent_user_id": user_id}, {"student_user_id": user_id}]}
            )
            if user_id
            else 0
        ),
    }


async def main() -> None:
    pipeline = [
        {"$group": {"_id": "$username", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
    ]

    groups = 0
    extra_docs = 0
    async for row in motor_db.login.aggregate(pipeline):
        username = row["_id"]
        groups += 1
        extra_docs += row["count"] - 1
        print(f"\n{username}  ({row['count']} documents)")
        async for doc in motor_db.login.find({"username": username}).sort("created_at", 1):
            info = await _describe(doc)
            print(
                "  _id={_id} user_id={user_id} pw={has_password} role={role} "
                "org={org_id} type={account_type} premium={premium_status} "
                "confirmed={confirmed} created={created_at}".format(**info)
            )
            print(
                "      links={links} attendance={attendance} "
                "classes={classes_enrolled} parent_links={parent_links}".format(**info)
            )

    if groups == 0:
        print("No duplicate usernames found.")
        print("Safe to add unique=True to the login.username index.")
    else:
        print(f"\n{groups} duplicated username(s); {extra_docs} document(s) beyond the first.")
        print("Reconcile these by hand before building the unique index.")


if __name__ == "__main__":
    # Accepted for muscle-memory parity with the other scripts; this one never writes.
    _ = "--dry-run" in sys.argv
    asyncio.run(main())
