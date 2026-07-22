"""Backfill `time` and `days` onto classes that have no schedule.

Classes created through the product never got one: TeacherSetupModal posted only
{name}, create_class defaulted time to "" and days to [], and attaching a link
never copied the link's schedule across. With no schedule, class_meets_on returns
False for every date, so no attendance row is written on join, no absence alert
or parent reminder fires, and attendance_rate reads 100% for everyone.

Going forward the class is authoritative and its schedule propagates DOWN to its
links (see classes.propagate_schedule_to_links). This script is the one place the
flow runs the other way, because for existing data the link is the only schedule
anyone ever entered.

Idempotent: only fills fields that are currently empty, never overwrites.

    python scripts/backfill_class_schedules.py [--dry-run]
"""
import asyncio
import os
import re
import sys

# Python puts this script's own directory (scripts/) on sys.path, not the cwd, so
# `python scripts/backfill_class_schedules.py` cannot import `app` without this.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import motor_db  # noqa: E402


def _usable(link: dict) -> bool:
    """Can this link's schedule stand in for a class schedule?

    Monthly and day-of-month links are excluded: LinkModal sets days to ALL SEVEN
    for those regardless of when the meeting actually happens, so adopting one
    would give the class a bogus seven-day-a-week schedule and manufacture
    absences every day of the year.
    """
    if not link.get("time") or not link.get("days"):
        return False
    repeat = link.get("repeat") or ""
    if repeat == "month" or re.match(r"^day \d+$", repeat):
        return False
    return True


def _rank(link: dict) -> tuple:
    """Primary links before supplemental ones, then oldest id first."""
    return (1 if link.get("link_type") == "supplemental" else 0, link.get("id", 0))


async def main(dry_run: bool) -> None:
    filled = ambiguous = unresolvable = 0

    query = {
        "$or": [
            {"time": {"$in": ["", None]}}, {"time": {"$exists": False}},
            {"days": {"$in": [[], None]}}, {"days": {"$exists": False}},
        ]
    }

    async for cls in motor_db.classes.find(query):
        link_ids = cls.get("link_ids") or []
        links = [
            l async for l in motor_db.links.find(
                {"id": {"$in": link_ids}}, {"id": 1, "time": 1, "days": 1, "repeat": 1, "link_type": 1, "_id": 0}
            )
        ] if link_ids else []
        candidates = sorted([l for l in links if _usable(l)], key=_rank)

        name = cls.get("name", "(unnamed)")
        if not candidates:
            unresolvable += 1
            print(f"  UNRESOLVED  {cls['class_id']}  {name!r}: no link carries a usable schedule")
            continue

        distinct = {(l["time"], tuple(l["days"])) for l in candidates}
        if len(distinct) > 1:
            ambiguous += 1
            print(f"  AMBIGUOUS   {cls['class_id']}  {name!r}: links disagree {sorted(distinct)}; using {candidates[0]['id']}")

        chosen = candidates[0]
        # Only fill what is actually empty, so a half-configured class keeps
        # whatever a human already set.
        updates = {}
        if not cls.get("time"):
            updates["time"] = chosen["time"]
        if not (cls.get("days") or []):
            updates["days"] = list(chosen["days"])
        if not updates:
            continue

        if not dry_run:
            await motor_db.classes.update_one({"class_id": cls["class_id"]}, {"$set": updates})
        filled += 1
        print(f"  {'would fill' if dry_run else 'filled'}  {cls['class_id']}  {name!r} -> {updates}")

    verb = "would backfill" if dry_run else "backfilled"
    print(f"\n{verb} {filled} class schedule(s); {ambiguous} ambiguous, {unresolvable} unresolvable")
    if unresolvable:
        print("Unresolvable classes need a schedule set by hand in the class Schedule tab;")
        print("until then they record no attendance and send no alerts.")


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
