# LinkJoin — Attendance Integrity: Build Brief

## Context

LinkJoin logs student attendance from the join event. Today, teachers create Zoom meetings in the
school's org account (LinkJoin does **not** create them), and the raw Zoom URL is visible to the
teacher. When a teacher pastes that raw URL into Canvas / a slide deck / a group chat, students can
join without touching LinkJoin — and those joins are **invisible** to us. The class silently
degrades from "attendance intelligence" to a manual roll sheet, and nobody is told.

We cannot prevent a teacher from possessing the raw link (they made it). So the strategy is:

1. **Remove the motive to paste** — make the compliant path the lazy path.
2. **Make leaks visible** — instrument the exception path so leakage is measurable, not silent.

## In scope (today)

- **A. Redirect links** — teacher-facing copy surface becomes a LinkJoin URL that logs, then redirects.
- **B. LMS auto-publish** — push the redirect link into the LMS so the teacher never needs to paste.
- **C. Instrumented override** — replace the bare checkbox with reason-coded, audited overrides.
- **D. Leak signal** — surface override/leak rate per teacher and per class on the admin dashboard.

## Explicitly NOT in scope (but design for it)

- **Zoom org-level read reconciliation.** Requires a Zoom admin OAuth grant we don't have yet. It is
  the eventual real fix (it catches leaked-link joins directly and backfills true timestamps).
- **Create-meeting-on-behalf-of teacher** (rotating / registrant-bound links).

> **Design constraint:** the data model must let both of these slot in later **without a migration of
> existing attendance rows.** See the `source` column below. Do not hard-code the assumption that an
> attendance record originates from a LinkJoin click.

---

## Step 0 — Discover before you build

Do not guess at the stack or schema. First:

1. Map the repo: framework, router, ORM/migrations, auth, background jobs, test runner.
2. Find the existing attendance write path — where a join is currently recorded — and the model that
   holds it. Find where `minutes_late` / `status` (`on_time` / `slightly_late` / `late`) is computed.
3. Find the existing manual override (the checkbox flow) and the existing LMS integrations
   (Google Classroom / Canvas / Schoology import, Clever / ClassLink roster sync).
4. Find how a class's Zoom URL is currently stored and where it is rendered to the teacher.

**Then write a short plan naming the exact files you'll touch, and confirm it before writing code.**
If any assumption below contradicts what's in the repo, the repo wins — flag it, don't paper over it.

---

## Data model

Add to the attendance/join event record (create if it doesn't exist; extend if it does):

| Field | Type | Notes |
|---|---|---|
| `source` | enum | `linkjoin_click`, `manual_override`, `zoom_reconciliation` (reserved, unused today) |
| `recorded_by_user_id` | fk, nullable | null for `linkjoin_click`; the teacher/admin for overrides |
| `reason_code` | enum, nullable | required when `source = manual_override` (see below) |
| `note` | text, nullable | free text, optional |
| `recorded_at` | timestamp | when the *record* was written (distinct from `join_time`) |

`join_time` / `minutes_late` / `status` stay nullable — an override may have no timestamp.

**Reason codes** (`manual_override`): `joined_outside_linkjoin`, `device_failure`,
`connectivity_outage`, `excused`, `late_enrollment`, `other` (requires `note`).

`joined_outside_linkjoin` is the leak signal. Keep it distinct from the others — do not collapse
these into one "manual" bucket.

**Backfill:** existing rows → `source = linkjoin_click`. Existing checkbox overrides, if
distinguishable, → `manual_override` + `reason_code = other`.

---

## A. Redirect links

**Route:** `GET /c/:class_slug` (opaque, non-guessable slug — not a sequential ID).

Behavior:

1. Resolve slug → class. 404 on unknown.
2. Require an authenticated, rostered user.
   - Not authenticated → send to login with `?next=` back to this URL, then continue.
   - Authenticated but **not on this class's roster** → do **not** log attendance; redirect to the
     meeting anyway (a co-teacher, sub, or admin may legitimately need in) and record a
     `roster_miss` audit event. Do not hard-block; a locked-out student at 8:59 AM is worse than a
     dirty record.
3. If within the join window for a session, write the attendance event
   (`source = linkjoin_click`) using the **existing** timestamp/status computation. Reuse it — do not
   reimplement the on_time / slightly_late / late thresholds.
4. **Idempotent:** a second click in the same session must not create a second row or alter the first
   recorded `join_time`.
5. 302 to the stored Zoom URL.

**Teacher UI change (the point of the whole exercise):**

- The prominent, default, one-click "Copy class link" control copies the **`/c/:slug` URL**.
- The raw Zoom URL is collapsed behind a disclosure ("Show underlying Zoom URL"), with a one-line
  caution that sharing it directly means joins won't be recorded.
- Same for any place we currently render the Zoom URL to a teacher — audit all of them.

**Do not** break the existing student auto-open flow. It should now route through `/c/:slug` too, so
there is exactly one code path that writes a `linkjoin_click`.

---

## B. LMS auto-publish

For classes imported from Google Classroom / Canvas / Schoology, publish the `/c/:slug` link into
the LMS course automatically (the natural surface per platform — e.g. course materials/link item).

- Idempotent: republishing updates the existing item rather than creating duplicates.
- Per-class opt-out toggle for teachers.
- Failures are non-fatal: log, surface to the teacher as a dismissible warning, retry with backoff.
- **Scope check:** confirm current OAuth scopes permit write. If they don't, **stop and report** —
  do not silently expand scopes. Ship A, C, and D without B if so.

---

## C. Instrumented override

Replace the bare checkbox flow. Keep it fast — teachers will abandon anything slow.

- Bulk-select students, then apply one status + one reason code to the selection.
- `reason_code` is **required**. `other` requires a `note`.
- Every override writes: actor, timestamp, reason, previous value. **Overrides are append-only** —
  never destructively update an attendance row; write a new event and resolve to the latest. This
  matters for anything touching funding or compliance audits.
- An override must **never** silently overwrite a real `linkjoin_click` join without showing the
  teacher what they're replacing.
- Optional `join_time` field: if the teacher knows the student joined at 9:04, let them enter it so
  `minutes_late` and the tardiness rate survive. **This is the difference between preserving the
  product's core data and losing it.** Make it easy to fill, never required.

---

## D. Leak signal (admin dashboard)

New panel, school-admin and district-admin roles only:

- **Override rate** per teacher and per class over the trailing 28 days (align with the existing
  28-day rolling window — reuse that code).
- **Leak rate:** share of attendance events with `reason_code = joined_outside_linkjoin`.
- Sort by leak rate descending. A teacher at the top of that list is the leak; that's the entire
  point of the panel.
- **Data-quality banner on any class whose leak rate crosses a configurable threshold:** its
  tardiness stats are unreliable, because the leaked joins have no timestamps. Pattern detection and
  auto-flagging must **not** run confidently on a class it can no longer see. Suppress or annotate
  the flags for that class — do not emit a confident "Repeat tardy" from partial data.

---

## Non-negotiables

- **Never lock a student out of class.** Every failure mode in `/c/:slug` — unknown session, roster
  miss, DB write failure, expired token — still ends in a redirect to the meeting. Log the problem;
  don't block the door. Attendance data is worth less than a student in class.
- **Role-based access** already exists (teacher / school admin / district admin). Every new route and
  panel must respect it. A teacher sees only their classes.
- Slugs are opaque and non-enumerable.
- FERPA/COPPA posture: no student PII in URLs, query params, logs, or analytics events.

## Tests

- `/c/:slug`: happy path, unauthenticated → login → redirect, double-click idempotency, outside join
  window, unknown slug, roster miss, redirect still fires when the attendance write fails.
- Override: reason code required, `other` requires note, append-only history preserved, optional
  `join_time` correctly feeds `minutes_late` / `status`.
- Leak metrics compute correctly; flag suppression triggers at threshold.
- Existing attendance and pattern-detection tests still pass unchanged.

## Report back

- Files touched and why.
- Anything in the repo that contradicted this brief.
- Whether LMS write scopes exist (blocks B).
- Every remaining place the raw Zoom URL is still exposed to a teacher.
