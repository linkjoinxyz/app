"""
Seed script: creates a full mock school org for MVP testing.

Usage (from linkjoin-backend/):
    python seed_school.py [--wipe]

--wipe   removes all Lincoln High School data before re-seeding.

Accounts created (all passwords: Test1234!):
  admin@lincoln.edu          — school_admin
  ms.chen@lincoln.edu        — teacher  (Sarah Chen)
  mr.patel@lincoln.edu       — teacher  (Raj Patel)
  mrs.johnson@lincoln.edu    — teacher  (Lisa Johnson)
  emma.wilson@student.lincoln.edu
  jake.martinez@student.lincoln.edu
  aisha.okonkwo@student.lincoln.edu
  tyler.nguyen@student.lincoln.edu
  sofia.rodriguez@student.lincoln.edu
  mason.park@student.lincoln.edu
  lily.thompson@student.lincoln.edu
  carlos.davis@student.lincoln.edu
"""

import asyncio
import secrets
import sys
from datetime import datetime, timezone
from argon2 import PasswordHasher
from cryptography.fernet import Fernet
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
ENCRYPT_KEY = os.environ["ENCRYPT_KEY"]

_fernet = Fernet(ENCRYPT_KEY.encode())
_hasher = PasswordHasher()

PASSWORD = "Test1234!"
ORG_NAME = "Lincoln High School"


def enc(url: str) -> bytes:
    return _fernet.encrypt(url.encode())


USERS = [
    {"email": "admin@lincoln.edu",               "name": "Principal Walker",   "role": "school_admin"},
    {"email": "ms.chen@lincoln.edu",             "name": "Sarah Chen",         "role": "teacher"},
    {"email": "mr.patel@lincoln.edu",            "name": "Raj Patel",          "role": "teacher"},
    {"email": "mrs.johnson@lincoln.edu",         "name": "Lisa Johnson",       "role": "teacher"},
    {"email": "emma.wilson@student.lincoln.edu", "name": "Emma Wilson",        "role": "student"},
    {"email": "jake.martinez@student.lincoln.edu","name": "Jake Martinez",     "role": "student"},
    {"email": "aisha.okonkwo@student.lincoln.edu","name": "Aisha Okonkwo",    "role": "student"},
    {"email": "tyler.nguyen@student.lincoln.edu","name": "Tyler Nguyen",       "role": "student"},
    {"email": "sofia.rodriguez@student.lincoln.edu","name": "Sofia Rodriguez", "role": "student"},
    {"email": "mason.park@student.lincoln.edu",  "name": "Mason Park",         "role": "student"},
    {"email": "lily.thompson@student.lincoln.edu","name": "Lily Thompson",     "role": "student"},
    {"email": "carlos.davis@student.lincoln.edu","name": "Carlos Davis",       "role": "student"},
]

# Classes: (teacher_email, name, time, days, zoom_url)
CLASSES_DEF = [
    ("ms.chen@lincoln.edu",    "Algebra II",      "8:30",  ["Mon", "Wed", "Fri"], "https://zoom.us/j/111000001"),
    ("ms.chen@lincoln.edu",    "Geometry",        "10:00", ["Tue", "Thu"],         "https://zoom.us/j/111000002"),
    ("ms.chen@lincoln.edu",    "Pre-Calculus",    "13:00", ["Mon", "Wed", "Fri"], "https://zoom.us/j/111000003"),
    ("mr.patel@lincoln.edu",   "Biology",         "9:00",  ["Mon", "Wed", "Fri"], "https://zoom.us/j/111000004"),
    ("mr.patel@lincoln.edu",   "Chemistry",       "11:00", ["Tue", "Thu"],         "https://zoom.us/j/111000005"),
    ("mrs.johnson@lincoln.edu","English 10",      "10:30", ["Mon", "Wed", "Fri"], "https://zoom.us/j/111000006"),
    ("mrs.johnson@lincoln.edu","Creative Writing", "14:00", ["Tue", "Thu"],        "https://zoom.us/j/111000007"),
]

# student_email → list of class names they're in
ENROLLMENTS = {
    "emma.wilson@student.lincoln.edu":    ["Algebra II", "Biology", "English 10"],
    "jake.martinez@student.lincoln.edu":  ["Algebra II", "Chemistry", "Creative Writing"],
    "aisha.okonkwo@student.lincoln.edu":  ["Geometry", "Biology", "English 10"],
    "tyler.nguyen@student.lincoln.edu":   ["Pre-Calculus", "Chemistry", "English 10"],
    "sofia.rodriguez@student.lincoln.edu":["Algebra II", "Biology", "Creative Writing"],
    "mason.park@student.lincoln.edu":     ["Geometry", "Chemistry", "English 10"],
    "lily.thompson@student.lincoln.edu":  ["Pre-Calculus", "Biology", "Creative Writing"],
    "carlos.davis@student.lincoln.edu":   ["Algebra II", "Geometry", "English 10"],
}


async def next_link_id(db) -> int:
    doc = await db.links.find_one(sort=[("id", -1)])
    return (doc["id"] if doc else 0) + 1


async def sync_id_counter(db) -> None:
    doc = await db.links.find_one(sort=[("id", -1)])
    max_id = doc["id"] if doc else 0
    await db.id.update_one({"_id": "id"}, {"$set": {"id": float(max_id)}}, upsert=True)


async def wipe(db, org_id: str, user_emails: list[str]):
    print("Wiping existing Lincoln High data...")
    await db.orgs.delete_many({"name": ORG_NAME})
    await db.classes.delete_many({"org_id": org_id})
    await db.links.delete_many({"username": {"$in": user_emails}})
    await db.login.delete_many({"username": {"$in": user_emails}})
    print("  done.")


async def main():
    do_wipe = "--wipe" in sys.argv

    client = AsyncIOMotorClient(MONGO_URI)
    # Fail closed: this script (esp. with --wipe) writes real data. Require an
    # explicit target database rather than defaulting to production so a bare
    # `python seed_school.py --wipe` can never destroy prod. Use e.g.
    # MONGO_DATABASE=linkjoin_test.
    db_name = os.environ.get("MONGO_DATABASE")
    if not db_name:
        raise SystemExit("Refusing to seed: set MONGO_DATABASE (e.g. linkjoin_test) first.")
    db = client[db_name]

    user_emails = [u["email"] for u in USERS]

    # --wipe: find existing org_id first so we can delete classes
    existing_org = await db.orgs.find_one({"name": ORG_NAME})
    if do_wipe:
        existing_org_id = existing_org["org_id"] if existing_org else ""
        await wipe(db, existing_org_id, user_emails)
        existing_org = None

    # 1. Org
    if existing_org:
        org_id = existing_org["org_id"]
        print(f"Org already exists: {org_id}")
    else:
        org_id = secrets.token_urlsafe(16)
        await db.orgs.insert_one({"org_id": org_id, "name": ORG_NAME, "type": "school", "parent_org_id": None})
        print(f"Created org '{ORG_NAME}': {org_id}")

    # 2. Users
    hashed_pw = _hasher.hash(PASSWORD)
    user_id_map = {}  # email → user_id

    for u in USERS:
        existing = await db.login.find_one({"username": u["email"]})
        if existing:
            user_id_map[u["email"]] = existing["user_id"]
            print(f"  User exists: {u['email']}")
            continue
        uid = secrets.token_urlsafe(16)
        user_id_map[u["email"]] = uid
        doc = {
            "username": u["email"],
            "name": u["name"],
            "password": hashed_pw,
            "confirmed": "true",
            "user_id": uid,
            "account_type": "institutional",
            "role": u["role"],
            "org_id": org_id,
            "created_at": datetime.now(timezone.utc),
        }
        await db.login.insert_one(doc)
        print(f"  Created {u['role']:12s}: {u['email']}")

    # 3. Classes + links
    class_id_map = {}  # class_name → class_id
    link_id_counter = await next_link_id(db)

    for teacher_email, cls_name, time, days, zoom_url in CLASSES_DEF:
        existing_cls = await db.classes.find_one({"name": cls_name, "org_id": org_id})
        if existing_cls:
            class_id_map[cls_name] = existing_cls["class_id"]
            print(f"  Class exists: {cls_name}")
            continue

        class_id = secrets.token_urlsafe(16)
        class_id_map[cls_name] = class_id
        teacher_uid = user_id_map[teacher_email]
        link_id = link_id_counter
        link_id_counter += 1

        # Insert teacher link
        link_doc = {
            "username": teacher_email,
            "id": link_id,
            "name": cls_name,
            "link": enc(zoom_url),
            "time": time,
            "days": days,
            "repeat": "week",
            "active": "true",
            "class_id": class_id,
            "class_name": cls_name,
            "link_type": "primary",
        }
        await db.links.insert_one(link_doc)

        # Insert class doc
        cls_doc = {
            "class_id": class_id,
            "org_id": org_id,
            "name": cls_name,
            "time": time,
            "days": days,
            "teacher_id": teacher_uid,
            "student_ids": [],
            "link_ids": [link_id],
        }
        await db.classes.insert_one(cls_doc)
        print(f"  Created class: {cls_name} ({time} {'/'.join(d[:2] for d in days)})")

    # 4. Enroll students + push links
    for student_email, class_names in ENROLLMENTS.items():
        student_uid = user_id_map[student_email]
        for cls_name in class_names:
            class_id = class_id_map.get(cls_name)
            if not class_id:
                continue
            cls = await db.classes.find_one({"class_id": class_id})
            if not cls:
                continue
            if student_uid in cls.get("student_ids", []):
                continue

            # Enroll
            await db.classes.update_one({"class_id": class_id}, {"$push": {"student_ids": student_uid}})

            # Push class links to student
            for link_id in cls.get("link_ids", []):
                teacher_link = await db.links.find_one({"id": link_id})
                if not teacher_link:
                    continue
                already = await db.links.find_one({"share_id": link_id, "username": student_email})
                if already:
                    continue
                new_id = link_id_counter
                link_id_counter += 1
                student_link = {k: v for k, v in teacher_link.items() if k not in ("_id", "username")}
                student_link["username"] = student_email
                student_link["id"] = new_id
                student_link["share_id"] = link_id
                student_link["class_id"] = class_id
                await db.links.insert_one(student_link)

    await sync_id_counter(db)
    print(f"\nDone. Enrolled students across {len(CLASSES_DEF)} classes.")
    print(f"\nAll passwords: {PASSWORD}")
    print(f"School admin:  admin@lincoln.edu")
    print(f"Teachers:      ms.chen, mr.patel, mrs.johnson @lincoln.edu")
    print(f"Students:      emma.wilson, jake.martinez, aisha.okonkwo, tyler.nguyen,")
    print(f"               sofia.rodriguez, mason.park, lily.thompson, carlos.davis @student.lincoln.edu")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
