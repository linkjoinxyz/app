"""Seed intervention records for local dev/testing."""
import asyncio
import secrets
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings


def _now(offset_days=0):
    return datetime.now(timezone.utc) - timedelta(days=offset_days)


SEED = [
    {
        "class_id": "o5Be9TobYXT7gK0XFDv4qg",
        "class_name": "Algebra II",
        "student_email": "jake.martinez@student.lincoln.edu",
        "student_name": "Jake Martinez",
        "flag_type": "repeat_tardy",
        "status": "in_progress",
        "assigned_to": "admin@lincoln.edu",
        "notes": [
            {"author": "admin@lincoln.edu", "text": "Spoke with Jake — alarm issue. Will monitor this week.", "days_ago": 5},
            {"author": "ms.chen@lincoln.edu", "text": "Still arriving 8-10 min late on Mon/Wed. Parents notified.", "days_ago": 2},
        ],
    },
    {
        "class_id": "o5Be9TobYXT7gK0XFDv4qg",
        "class_name": "Algebra II",
        "student_email": "emma.wilson@student.lincoln.edu",
        "student_name": "Emma Wilson",
        "flag_type": "low_attendance",
        "status": "open",
        "assigned_to": None,
        "notes": [],
    },
    {
        "class_id": "f9GMhwjYOLUcN2Ab47N85g",
        "class_name": "Biology",
        "student_email": "tyler.nguyen@student.lincoln.edu",
        "student_name": "Tyler Nguyen",
        "flag_type": "low_attendance",
        "status": "open",
        "assigned_to": "counselor@lincoln.edu",
        "notes": [
            {"author": "admin@lincoln.edu", "text": "Referred to school counselor — possible home situation.", "days_ago": 3},
        ],
    },
    {
        "class_id": "d3WEd9P_5O-fY-TzubAMcQ",
        "class_name": "English 10",
        "student_email": "aisha.okonkwo@student.lincoln.edu",
        "student_name": "Aisha Okonkwo",
        "flag_type": "repeat_tardy",
        "status": "resolved",
        "assigned_to": None,
        "notes": [
            {"author": "ms.chen@lincoln.edu", "text": "Schedule conflict with bus route — resolved after route change.", "days_ago": 8},
        ],
    },
    {
        "class_id": "E7AO9Ogddq3voTYCgzNJFA",
        "class_name": "Geometry",
        "student_email": "jake.martinez@student.lincoln.edu",
        "student_name": "Jake Martinez",
        "flag_type": "low_attendance",
        "status": "in_progress",
        "assigned_to": "admin@lincoln.edu",
        "notes": [
            {"author": "admin@lincoln.edu", "text": "Three absences in two weeks — checking in with family.", "days_ago": 4},
        ],
    },
]

ORG_ID = "MAsWijPX9WWhkDpvGQTIFg"


async def main():
    s = get_settings()
    client = AsyncIOMotorClient(s.mongo_uri)
    db = client[s.mongo_database]

    inserted = 0
    skipped = 0

    for entry in SEED:
        existing = await db.interventions.find_one({
            "class_id": entry["class_id"],
            "student_email": entry["student_email"],
            "flag_type": entry["flag_type"],
        })
        if existing:
            print(f"  skip  {entry['student_name']} / {entry['class_name']} / {entry['flag_type']}")
            skipped += 1
            continue

        notes = []
        for n in entry["notes"]:
            notes.append({
                "note_id": secrets.token_urlsafe(12),
                "author_email": n["author"],
                "text": n["text"],
                "created_at": _now(n["days_ago"]),
            })

        doc = {
            "intervention_id": secrets.token_urlsafe(16),
            "org_id": ORG_ID,
            "class_id": entry["class_id"],
            "class_name": entry["class_name"],
            "student_email": entry["student_email"],
            "student_name": entry["student_name"],
            "flag_type": entry["flag_type"],
            "status": entry["status"],
            "assigned_to": entry["assigned_to"],
            "notes": notes,
            "created_at": _now(7),
            "updated_at": _now(0),
        }
        await db.interventions.insert_one(doc)
        print(f"  created {entry['student_name']} / {entry['class_name']} / {entry['flag_type']} → {entry['status']}")
        inserted += 1

    client.close()
    print(f"\nDone: {inserted} created, {skipped} already existed.")


if __name__ == "__main__":
    asyncio.run(main())
