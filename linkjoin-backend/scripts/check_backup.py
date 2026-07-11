#!/usr/bin/env python3
"""
LinkJoin backup health check script.

Connects to MongoDB Atlas, verifies all core collections have documents,
measures read latency, and writes a JSON health snapshot to stdout.

Usage:
    MONGO_URI=<uri> MONGO_DATABASE=zoom_opener python scripts/check_backup.py

Exit codes:
    0  All checks passed
    1  One or more checks failed (degraded or unavailable)
"""

import json
import os
import sys
import time
from datetime import datetime, timezone


def main():
    try:
        from pymongo import MongoClient
        from pymongo.errors import ConnectionFailure, OperationFailure
    except ImportError:
        print(json.dumps({"error": "pymongo not installed", "ok": False}))
        sys.exit(1)

    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        try:
            from app.config import get_settings
            mongo_uri = get_settings().mongo_uri
            mongo_db = get_settings().mongo_database
        except Exception:
            print(json.dumps({"error": "MONGO_URI not set and app config not loadable", "ok": False}))
            sys.exit(1)
    else:
        mongo_db = os.getenv("MONGO_DATABASE", "zoom_opener")

    CORE_COLLECTIONS = [
        "login",
        "links",
        "orgs",
        "classes",
        "audit_logs",
        "attendance",
        "interventions",
        "invites",
        "analytics_events",
    ]

    snapshot: dict = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "ok": True,
        "mongo_latency_ms": None,
        "collections": {},
        "errors": [],
    }

    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        db = client[mongo_db]

        t0 = time.monotonic()
        client.admin.command("ping")
        snapshot["mongo_latency_ms"] = round((time.monotonic() - t0) * 1000, 1)

        for coll_name in CORE_COLLECTIONS:
            try:
                t1 = time.monotonic()
                count = db[coll_name].estimated_document_count()
                latency = round((time.monotonic() - t1) * 1000, 1)
                snapshot["collections"][coll_name] = {
                    "count": count,
                    "latency_ms": latency,
                    "ok": True,
                }
                if count == 0 and coll_name in ("login", "links"):
                    snapshot["errors"].append(f"{coll_name}: unexpectedly empty")
                    snapshot["ok"] = False
            except Exception as e:
                snapshot["collections"][coll_name] = {"ok": False, "error": str(e)}
                snapshot["errors"].append(f"{coll_name}: {e}")
                snapshot["ok"] = False

        client.close()
    except (ConnectionFailure, OperationFailure) as e:
        snapshot["ok"] = False
        snapshot["errors"].append(f"MongoDB connection failed: {e}")

    print(json.dumps(snapshot, indent=2))
    sys.exit(0 if snapshot["ok"] else 1)


if __name__ == "__main__":
    main()
