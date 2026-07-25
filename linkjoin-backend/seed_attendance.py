"""
Seed attendance data for Lincoln High School test accounts.

Usage (from linkjoin-backend/):
    python seed_attendance.py [--wipe]

--wipe   clears all existing attendance records before inserting.

Inserts 4 weeks of realistic attendance records so the teacher dashboard
Attendance and Patterns sections have data immediately.

Student behavior profiles:
  emma.wilson       — always on time
  jake.martinez     — occasionally 2-4 min late (not flagged)
  aisha.okonkwo     — repeat tardy: 7-12 min late most sessions  [FLAGGED: repeat_tardy]
  tyler.nguyen      — always on time
  sofia.rodriguez   — attends only ~35% of sessions              [FLAGGED: low_attendance]
  mason.park        — mostly on time, one or two late
  lily.thompson     — low attendance + repeat tardy              [FLAGGED: both]
  carlos.davis      — always on time
"""

import asyncio
import random
import sys
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
LOOKBACK_DAYS = 28

_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}

# minutes_late generator per student (callable returning int)
# Negative = early, 0 = on time, positive = late
PROFILES = {
    "emma.wilson@student.lincoln.edu":      lambda: random.randint(-2, 1),
    "jake.martinez@student.lincoln.edu":    lambda: random.randint(-1, 4),
    "aisha.okonkwo@student.lincoln.edu":    lambda: random.randint(6, 12),
    "tyler.nguyen@student.lincoln.edu":     lambda: random.randint(-3, 1),
    "sofia.rodriguez@student.lincoln.edu":  lambda: random.randint(-1, 3),   # attends rarely
    "mason.park@student.lincoln.edu":       lambda: random.choice([-1, 0, 0, 1, 2, 7]),
    "lily.thompson@student.lincoln.edu":    lambda: random.randint(5, 15),   # attends rarely + tardy
    "carlos.davis@student.lincoln.edu":     lambda: random.randint(-2, 2),
}

# Fraction of sessions each student actually attends (1.0 = all)
ATTENDANCE_RATES = {
    "emma.wilson@student.lincoln.edu":      1.0,
    "jake.martinez@student.lincoln.edu":    0.9,
    "aisha.okonkwo@student.lincoln.edu":    0.85,
    "tyler.nguyen@student.lincoln.edu":     1.0,
    "sofia.rodriguez@student.lincoln.edu":  0.35,
    "mason.park@student.lincoln.edu":       0.95,
    "lily.thompson@student.lincoln.edu":    0.40,
    "carlos.davis@student.lincoln.edu":     1.0,
}


def session_dates(days: list[str], lookback: int = LOOKBACK_DAYS) -> list[datetime]:
    """Return UTC datetimes for each day in the past `lookback` days matching the schedule."""
    now = datetime.now(timezone.utc)
    scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in days if d in _DAY_TO_WEEKDAY}
    sessions = []
    for i in range(lookback, 0, -1):
        day = now - timedelta(days=i)
        if day.weekday() in scheduled_weekdays:
            sessions.append(day)
    return sessions


async def main():
    do_wipe = "--wipe" in sys.argv
    rng = random.Random(42)  # deterministic so re-runs produce same data

    client = AsyncIOMotorClient(MONGO_URI)
    # Fail closed rather than defaulting to the production database, so a bare
    # run cannot write to prod by accident. Use e.g. MONGO_DATABASE=linkjoin_test.
    db_name = os.environ.get("MONGO_DATABASE")
    if not db_name:
        raise SystemExit("Refusing to seed: set MONGO_DATABASE (e.g. linkjoin_test) first.")
    db = client[db_name]

    if do_wipe:
        result = await db.attendance.delete_many({})
        print(f"Wiped {result.deleted_count} existing attendance records.")

    # Fetch all Lincoln classes
    classes = await db.classes.find({}).to_list(None)
    if not classes:
        print("No classes found. Run seed_school.py first.")
        return

    total = 0
    for cls in classes:
        class_id = cls["class_id"]
        class_name = cls.get("name", "")
        class_days = cls.get("days") or []
        class_time = cls.get("time") or "9:00"

        if not class_days:
            continue

        # Parse class time (24h local)
        try:
            ch, cm = map(int, class_time.split(":"))
        except ValueError:
            ch, cm = 9, 0

        sessions = session_dates(class_days)
        if not sessions:
            continue

        # Resolve enrolled student emails
        student_docs = []
        for uid in cls.get("student_ids") or []:
            u = await db.login.find_one({"user_id": uid}, {"username": 1, "_id": 0})
            if u:
                student_docs.append(u["username"])

        for student_email in student_docs:
            attend_rate = ATTENDANCE_RATES.get(student_email, 0.9)
            late_fn = PROFILES.get(student_email, lambda: rng.randint(-2, 3))

            # Find the student's link for this class (share_id-based copy)
            student_link = await db.links.find_one({
                "username": student_email,
                "class_id": class_id,
            })
            link_id = student_link["id"] if student_link else 0

            records = []
            for session_dt in sessions:
                if rng.random() > attend_rate:
                    continue  # student skipped this session
                minutes_late = late_fn()
                # opened_at = scheduled session time + lateness + small random seconds
                opened_at = session_dt.replace(hour=ch, minute=cm, second=0, microsecond=0) \
                    + timedelta(minutes=minutes_late, seconds=rng.randint(0, 59))
                records.append({
                    "student_email": student_email,
                    "link_id": link_id,
                    "class_id": class_id,
                    "class_name": class_name,
                    "share_id": student_link.get("share_id") if student_link else None,
                    "opened_at": opened_at,
                    "minutes_late": minutes_late,
                })

            if records:
                await db.attendance.insert_many(records)
                total += len(records)
                print(f"  {student_email} → {class_name}: {len(records)} records")

    print(f"\nDone. Inserted {total} attendance records total.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
