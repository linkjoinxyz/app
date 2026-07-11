"""
Seed parent accounts for Lincoln High School students.

Usage (from linkjoin-backend/):
    python seed_parents.py

Creates one parent account per student, all with password Test1234!
Links each parent to their child via parent_links collection.

Parent accounts:
  david.wilson@gmail.com      Emma Wilson
  carlos.martinez@gmail.com   Jake Martinez
  mai.nguyen@gmail.com        Sophia Nguyen
  patrick.oconnor@gmail.com   Liam O'Connor
  priya.patel@gmail.com       Ava Patel
  jisoo.kim@gmail.com         Noah Kim
  rosa.torres@gmail.com       Isabella Torres
  henry.lee@gmail.com         Mason Lee
  james.brown@gmail.com       Olivia Brown
  karen.davis@gmail.com       Ethan Davis
  elena.garcia@gmail.com      Mia Garcia
  michael.johnson@gmail.com   Lucas Johnson
  linda.smith@gmail.com       Charlotte Smith
  thomas.white@gmail.com      Aiden White
"""

import asyncio
import base64
import os
import secrets
from argon2 import PasswordHasher
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
_hasher = PasswordHasher()
PASSWORD = "Test1234!"

PARENTS = [
    {"email": "david.wilson@gmail.com",    "first_name": "David",   "last_name": "Wilson",   "student_email": "emma.wilson@student.lincoln.edu"},
    {"email": "carlos.martinez@gmail.com", "first_name": "Carlos",  "last_name": "Martinez", "student_email": "jake.martinez@student.lincoln.edu"},
    {"email": "mai.nguyen@gmail.com",      "first_name": "Mai",     "last_name": "Nguyen",   "student_email": "sophia.nguyen@student.lincoln.edu"},
    {"email": "patrick.oconnor@gmail.com", "first_name": "Patrick", "last_name": "OConnor",  "student_email": "liam.oconnor@student.lincoln.edu"},
    {"email": "priya.patel@gmail.com",     "first_name": "Priya",   "last_name": "Patel",    "student_email": "ava.patel@student.lincoln.edu"},
    {"email": "jisoo.kim@gmail.com",       "first_name": "Jisoo",   "last_name": "Kim",      "student_email": "noah.kim@student.lincoln.edu"},
    {"email": "rosa.torres@gmail.com",     "first_name": "Rosa",    "last_name": "Torres",   "student_email": "isabella.torres@student.lincoln.edu"},
    {"email": "henry.lee@gmail.com",       "first_name": "Henry",   "last_name": "Lee",      "student_email": "mason.lee@student.lincoln.edu"},
    {"email": "james.brown@gmail.com",     "first_name": "James",   "last_name": "Brown",    "student_email": "olivia.brown@student.lincoln.edu"},
    {"email": "karen.davis@gmail.com",     "first_name": "Karen",   "last_name": "Davis",    "student_email": "ethan.davis@student.lincoln.edu"},
    {"email": "elena.garcia@gmail.com",    "first_name": "Elena",   "last_name": "Garcia",   "student_email": "mia.garcia@student.lincoln.edu"},
    {"email": "michael.johnson@gmail.com", "first_name": "Michael", "last_name": "Johnson",  "student_email": "lucas.johnson@student.lincoln.edu"},
    {"email": "linda.smith@gmail.com",     "first_name": "Linda",   "last_name": "Smith",    "student_email": "charlotte.smith@student.lincoln.edu"},
    {"email": "thomas.white@gmail.com",    "first_name": "Thomas",  "last_name": "White",    "student_email": "aiden.white@student.lincoln.edu"},
]


def _gen_id(n=12) -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(n)).decode().rstrip("=")


async def run():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.zoom_opener

    hashed = _hasher.hash(PASSWORD)
    created = 0
    linked = 0

    for p in PARENTS:
        student = await db.login.find_one({"username": p["student_email"]}, {"user_id": 1})
        if not student:
            print(f"  SKIP (student not found): {p['student_email']}")
            continue
        student_user_id = student["user_id"]

        existing = await db.login.find_one({"username": p["email"]})
        if existing:
            parent_user_id = existing["user_id"]
            print(f"  EXISTS: {p['email']} (user_id={parent_user_id})")
        else:
            parent_user_id = _gen_id()
            await db.login.insert_one({
                "username": p["email"],
                "password": hashed,
                "user_id": parent_user_id,
                "first_name": p["first_name"],
                "last_name": p["last_name"],
                "name": f"{p['first_name']} {p['last_name']}",
                "role": "parent",
                "account_type": "personal",
                "confirmed": "true",
                "onboarding_done": True,
            })
            created += 1
            print(f"  CREATED: {p['email']}")

        link_exists = await db.parent_links.find_one({
            "parent_user_id": parent_user_id,
            "student_user_id": student_user_id,
        })
        if not link_exists:
            await db.parent_links.insert_one({
                "parent_user_id": parent_user_id,
                "student_user_id": student_user_id,
                "student_email": p["student_email"],
            })
            linked += 1
            print(f"    Linked -> {p['student_email']}")
        else:
            print(f"    Link already exists -> {p['student_email']}")

    print(f"\nDone. Created {created} parent accounts, {linked} new links.")
    client.close()


asyncio.run(run())
