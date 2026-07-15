---
type: concept
title: Attendance Integrity feature (2026-07-13/14)
ingested_via: put_page
ingested_at: '2026-07-14T17:17:42.670Z'
source_kind: put_page
tags:
  - attendance
  - decisions
  - feature
  - linkjoin
---

# Attendance Integrity — implementation record

Implemented brief sections A (redirect links), C (instrumented override), D (leak
signal). Section B (LMS auto-publish) deferred per the brief's own contingency —
Google Classroom's granted OAuth scopes can't write course materials, and Canvas's
write capability isn't verifiable from the repo (governed by an opaque org-level
Developer Key config).

## Key architectural decision: /c/:slug is a frontend route, not a literal 302

This app has no cookie session — auth is a Bearer JWT in localStorage
(`linkjoin-frontend/src/api/client.js`). A plain browser navigation can't attach a
stored token as an Authorization header, so a server-side 302 can't auth-gate
anything. `/c/:slug` is a React Router route (`ClassLinkRedirect.jsx`) wrapped in
`PrivateRoute`, which calls the authenticated `GET /links/c/{slug}` endpoint and
does a client-side "redirect" via `window.open`. Functionally equivalent to what
the brief wanted (log-then-redirect, one write path, idempotent, non-blocking),
just not a literal HTTP redirect.

## Product decision: raw meeting URLs fully redacted for organizational links

Clarified mid-implementation: for any link with `class_id` set, the raw meeting
URL must never reach the browser except transiently at the moment of a `/c/:slug`
click. Not a UI disclosure toggle — a backend-level redaction. Personal
(non-institutional) links are unaffected. Implemented in
`app/utils.py::_clean_items` (omits `link`, adds a `platform` field instead) and
propagated through `get_class_links`, all websocket broadcasts (they route through
the same `configure_data()`), and `LinkModal.jsx`'s edit form (class-linked edits
become a write-only "replace meeting link" field since there's nothing to
pre-fill).

## Real bugs found during live verification (not caught by code review)

1. **Idempotency was actually broken.** The `/c/:slug` dedup window was built from
   `session_start`'s UTC-midnight-aligned calendar day. For negative-UTC-offset
   timezones (any US timezone), a click in the local evening lands on the *next*
   UTC calendar day, so the window missed the row it had just inserted — every
   click created a new row. Fixed by matching on the `record_date` string field
   instead of a UTC timestamp range. Caught only by an actual live 3-call test
   against a real `America/Los_Angeles` teacher account, not by reading the code.
2. **`get_class_patterns` crashed (500).** Append-only overrides can produce a row
   with a real `opened_at` but `minutes_late: None` (when a teacher enters a
   `join_time` for a date outside the class's own recurring schedule).
   `r.get("minutes_late", 0)` only substitutes the default when the *key is
   absent*, not when the value is explicitly `None` — comparing `None > int`
   threw `TypeError`. Fixed at the write-site root cause (fall back to
   `minutes_late = 0` when session_start can't be resolved) and defensively at
   every read site (`get_class_patterns`, `export_class_attendance`,
   `get_my_rewards`).
3. **`get_my_rewards` had the same latent crash risk** — queries all attendance
   rows for a student with no filter; an absent/excused override has
   `opened_at: None`, and `None.tzinfo` would throw. Fixed by filtering
   `opened_at: {"$ne": None}` at the query level.
4. **Two frontend crash sites** in `AdminDashboard.jsx`'s attendance history table
   — `r.opened_at.slice(0, 10)` on override-created absent rows (null
   `opened_at`). Fixed using the new `record_date` field as the primary source,
   falling back to `opened_at?.slice(...)`.
5. **Pre-existing bug found and fixed as a side effect**: `update_link`'s
   `replace_one` built a fresh doc that dropped `class_id`/`class_name`/
   `link_type`/`slug` entirely — editing a class-linked link silently un-linked it
   from its class. Would have broken the redirect feature the first time a
   teacher edited a class link. Fixed by preserving those fields from `existing`.
6. **`link_type: "primary"` was dead code** — only `add_class_link` ever writes
   `link_type`, and it always hardcodes `"supplemental"`. `"primary"` only ever
   appears in `seed_school.py` (demo seed data), never a real write path. New
   code gates on `class_id` presence, not `link_type`.

## Testing approach

No pytest suite exists in this repo. Verified live: a Python script minting
short-lived JWTs in-process (via `create_token`, never printed — the auto-mode
classifier correctly blocks printing live tokens to the transcript) against the
local dev backend, covering happy path, idempotency (3 consecutive calls, 0/1/1/1
new rows with a clean student), roster-miss + audit log, unauthenticated 401,
unknown-slug 404, override validation (invalid reason_code, "other" without note),
append-only history preservation, leak-rate math (seeded 15 override rows to
cross a 15% threshold, confirmed `flagged: true` and all 8 class students
annotated `suppressed: true` in patterns), and a real browser pass via `/browse`
(unauthenticated `/c/:slug` → `/login?redirect=...` chain, signup → personal link
create/edit still works unaffected by the redaction change).

## Standing gap noted for later

`DistrictAdminView` in `AdminDashboard.jsx` is still a "coming soon" stub — the
new leak-signal tab only reaches `school_admin`, not `district_admin`, since the
district dashboard doesn't exist yet at all (pre-existing gap, unrelated to this
feature).
