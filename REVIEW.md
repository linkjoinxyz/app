# LinkJoin Full-Stack Review

Read-only review of `linkjoin-backend` (FastAPI), `linkjoin-frontend` (React), and `linkjoin-extension` (MV3).
Date: 2026-07-20. Branch: `dev`. Nothing was modified.

Every finding below is traced to a specific file and line and has a concrete failure path.
Items I could not construct a failure for were dropped rather than padded in.
Two candidate findings were investigated and **discarded as non-issues** (see "Checked and clean").

## Table of contents

| # | Sev | Finding | File |
|---|-----|---------|------|
| 1 | CRITICAL | Any school admin can link a parent account to any student platform-wide | `routers/admin.py:557` |
| 2 | CRITICAL | Any school admin can reassign any existing account's org and role | `routers/admin.py:385` |
| 3 | HIGH | `_check_token` accepts non-access tokens, bypassing MFA and revocation | `routers/orgs.py:39` |
| 4 | HIGH | SSRF via org calendar iCal import | `routers/orgs.py:383` |
| 5 | HIGH | Accepting a shared link always 500s on the unique `slug` index | `routers/links.py:525` |
| 6 | HIGH | Attendance override computes `minutes_late` against the wrong day | `routers/attendance.py:502` |
| 7 | HIGH | `/auth/set-password` changes a password without the current one | `routers/auth.py:274` |
| 8 | HIGH | `login.username` is not unique, so registration races create duplicate accounts | `main.py:97` |
| 9 | HIGH | One malformed link permanently disables every scheduled job | `scheduler.py:655` |
| 10 | HIGH | Scheduler has no leader failover, and a demoted leader keeps firing jobs | `scheduler.py:41` |
| 11 | MEDIUM | `org_disabled` is enforced only in the frontend | `routers/admin.py:138` |
| 12 | MEDIUM | Editing a link silently wipes its meeting password | `routers/links.py:307` |
| 13 | MEDIUM | Account deletion leaves attendance and intervention records behind | `routers/users.py:505` |
| 14 | MEDIUM | Inbound SMS webhook fails open and blocks the event loop | `routers/messaging.py:18` |
| 15 | MEDIUM | Note saving is a lost-update race with no size cap | `routers/users.py:187` |
| 16 | MEDIUM | Accepting any invite marks the email confirmed | `routers/invites.py:274` |
| 17 | MEDIUM | History pagination truncates milliseconds and skips events | `routers/links.py:208` |
| 18 | MEDIUM | Redis outage silently disables token revocation | `auth.py:95` |
| 19 | MEDIUM | Platform admin view loads entire collections into memory | `utils.py:139` |
| 20 | MEDIUM | Nested N+1 queries across the attendance read paths | `routers/orgs.py:513` |
| 21 | MEDIUM | One duplicate alert aborts the remaining students in a class | `scheduler.py:398` |
| 22 | MEDIUM | CSP allows `unsafe-inline` while the token lives in localStorage | `main.py:58` |
| 23 | LOW | Admin token compared non-constant-time | `routers/orgs.py:43` |
| 24 | LOW | Shipped extension manifest still has a placeholder OAuth client id | `manifest.json:13` |
| 25 | LOW | Debug endpoint `/health/client-ip` exposed in production | `main.py:237` |
| 26 | LOW | Unsafe `minutes_late` accessor inconsistent with the rest of the codebase | `routers/users.py:386` |
| 27 | LOW | Unbounded attendance scan on the rewards endpoint | `routers/attendance.py:290` |
| 28 | LOW | Excused-absence endpoint accepts arbitrary student emails | `routers/classes.py:257` |
| 29 | LOW | Phone numbers stored via `int()`, mangling leading zeros | `routers/users.py:128` |
| 30 | LOW | Password reset email states the wrong expiry | `routers/auth.py:431` |

---

## CRITICAL

### [CRITICAL] Any school admin can link a parent account to any student platform-wide
**File:** `linkjoin-backend/app/routers/admin.py:557`

**What:** `import_org_parents` is callable by a school admin for their own org, but it resolves `student_email` against the entire `login` collection with no org scoping, then writes a `parent_links` row that the parent portal treats as sole proof of authorization.

**Failure scenario:** Alice is a legitimate `school_admin` of org `A` (a paying customer, no platform-admin rights). She calls:

```
POST /admin/orgs/A/import-parents
{"rows":[{"parent_email":"alice@evil.com","student_email":"victim@other-district.edu"}]}
```

The guard at `admin.py:534-537` passes because `user.org_id == "A"`. Line 557 looks up the student by email with no org filter and finds the victim in org `B`. Lines 563-583 create a `parent` account for `alice@evil.com` and email the temporary password **to Alice**. Lines 593-605 insert a `parent_links` document joining Alice to the victim.

Alice then logs in as the parent. `routers/parent.py:33-37` (`_parent_student_ids`) authorizes purely on `parent_links` membership, with no org check anywhere in the file. `GET /parent/children` returns the victim's name, email, and `org_id`; `GET /parent/children/{id}/classes` returns their full class roster, attendance rate, tardy counts, and per-session history. Cross-tenant student PII disclosure by any school admin against any student in the platform.

**Fix:** After line 557, reject the row unless `student.get("org_id") in await get_accessible_org_ids(user)`.

---

### [CRITICAL] Any school admin can reassign any existing account's org and role
**File:** `linkjoin-backend/app/routers/admin.py:385`

**What:** In `import_staff`, the "user already exists" branch overwrites `role`, `org_id`, and `account_type` keyed only on email, with no check that the account currently belongs to the caller's org.

**Failure scenario:** Alice is `school_admin` of org `A`. She calls:

```
POST /admin/orgs/A/import-staff
{"rows":[{"email":"victim@other-district.edu","role":"teacher"}]}
```

The guard at `admin.py:356-359` passes (`is_own_org_admin`). Line 385 finds the existing account, and lines 387-390 execute `$set: {role: "teacher", org_id: "A", account_type: "institutional"}`.

Two consequences. First, denial of access: the victim, previously a `district_admin` of org `B`, loses their org and role and is locked out of their own district's data. Second, and worse, the victim is now a member of org `A`, so Alice can read them through her normal admin surfaces: `GET /orgs/A/members` (`orgs.py:181`) returns the victim's record, and `GET /users/student/{user_id}` (`users.py:336`) passes its `get_accessible_org_ids` check and returns parent contact details, attendance, and interventions.

Note this is exploitable against **every** account in the platform, since the only key is an email address the attacker types in. `import_org_members` at line 420 gets this right by requiring `require_platform_admin`; `import_staff` and `import_org_parents` do not.

**Fix:** Before the update at line 387, require `existing.get("org_id") in await get_accessible_org_ids(user)` unless the caller is a platform admin.

---

## HIGH

### [HIGH] `_check_token` accepts non-access tokens, bypassing MFA and revocation
**File:** `linkjoin-backend/app/routers/orgs.py:39`

**What:** `_check_token` decodes the JWT directly with `jwt.decode` and checks only `sub` plus the `admin` flag. It skips all three guards that `app/auth.py:get_current_user` applies: the `_NON_ACCESS_CLAIMS` rejection, the Redis JTI blacklist, and the password-change epoch.

**Failure scenario:** A platform admin with MFA enabled posts valid credentials to `/auth/login`. Because `force_mfa` is true (`auth.py:252`), the response is not an access token but a pre-MFA session: `create_token(email, minutes=10, extra={"scope": "mfa_only"})` (`auth.py:256`). That token is explicitly designed to be useless until the second factor is supplied, and `auth.py:85-86` rejects it everywhere else.

Sending it as `Authorization: Bearer <mfa_session>` to `POST /orgs` succeeds: `jwt.decode` at `orgs.py:47` validates the signature, `sub` is present, and the `admin == "true"` lookup passes. The attacker creates an org and, via `body.admin_email`, provisions a `school_admin` account with a temporary password mailed to an address they choose (`orgs.py:112-138`). MFA is bypassed with the password alone.

The same gap accepts a `purpose: "reset"` token, a `purpose: "confirm"` token, a 1-minute `purpose: "ws"` ticket from `/ws-ticket`, a token already blacklisted by `/auth/logout`, and a token issued before a password reset that was meant to evict it.

**Fix:** Replace the hand-rolled decode with `Depends(get_current_user)` plus `require_platform_admin`, keeping the `x_admin_token` header path as the only alternative.

---

### [HIGH] SSRF via org calendar iCal import
**File:** `linkjoin-backend/app/routers/orgs.py:383`

**What:** `import_ical` fetches a fully attacker-controlled URL server-side with redirects enabled and no scheme, host, or IP validation, then reflects fetch and parse errors back to the caller.

**Failure scenario:** Any `school_admin` calls:

```
POST /orgs/{their_own_org}/calendar/ical
{"url":"http://169.254.169.254/metadata/instance?api-version=2021-02-01"}
```

The authz check at line 387 passes because it is their own org. Line 395-396 issues the request from inside the Azure network with `follow_redirects=True`, reaching the cloud metadata endpoint, `http://localhost:*` services, and any RFC1918 address the app can route to. The app runs alongside Redis (`config.py:40`) and MongoDB.

Response content leaks two ways: `_parse_ical` failures are echoed verbatim at line 406 (`f"Could not parse calendar: {str(e)}"`), and any content that does parse as iCal is written into `blackout_dates` and returned. Even where content does not leak, the distinction between a connection error, a timeout, and an HTTP status at lines 398-401 is a working internal port scanner. `follow_redirects=True` also defeats any allowlist applied only to the initial URL.

**Fix:** Resolve the hostname before fetching, reject non-public IPs (including after each redirect), restrict the scheme to `https`, and return a fixed error string instead of `str(e)`.

---

### [HIGH] Accepting a shared link always 500s on the unique `slug` index
**File:** `linkjoin-backend/app/routers/links.py:525`

**What:** `add_link_via_share` copies the source document while excluding only `_id`, `username`, and `share`. It retains `slug`, which carries a unique index, so the insert violates it.

**Failure scenario:** `main.py:96` declares `motor_db.links.create_index("slug", unique=True, sparse=True)`. Every link created since `create_link` (`links.py:270`) has a slug. User A shares a link with user B; B opens the emailed `/addlink?id=<share_token>` URL, which calls `GET /links/addlink`. Line 525 builds `new_doc` still holding A's slug, and line 531 `insert_one` raises `DuplicateKeyError`, surfacing as an unhandled 500. The share-acceptance flow is broken for every link that has a slug.

This is clearly unintended: the two sibling copy paths both handle it correctly. `share_link` at line 467 excludes `slug`, and `_push_link_to_student` at `classes.py:30` excludes it and assigns a fresh one at line 36. Only this path was missed.

A second defect rides along: `share_token` is also retained, so the copy and the original share a token, and the lookup at line 512 (`find_one({"share_token": id})`) can then return the wrong document.

**Fix:** Add `"slug"` and `"share_token"` to the exclusion set at line 525 and assign fresh values, matching `classes.py:30-36`.

---

### [HIGH] Attendance override computes `minutes_late` against the wrong day
**File:** `linkjoin-backend/app/routers/attendance.py:502`

**What:** `override_class_attendance` probes for the session start using midnight **UTC** of the override date. For any teacher in a negative-UTC-offset timezone that instant falls on the previous local day, so `compute_session_start_utc` evaluates the wrong weekday. It also stores the teacher's locally-entered `join_time` as if it were UTC.

**Failure scenario:** Verified by executing the code path. Teacher in `US/Eastern`, class at `09:00` on Mon-Fri.

Case 1, override for Tuesday 2026-07-21 with `join_time` `09:05`:
```
probe (midnight UTC) : 2026-07-21 00:00:00+00:00
probe in teacher tz  : 2026-07-20 20:00:00-04:00   <- Monday, not Tuesday
session_start        : 2026-07-20 13:00:00+00:00
session_start_on_day : 2026-07-21 13:00:00+00:00
minutes_late         : -235
```
A student who joined five minutes late is recorded as 235 minutes early.

Case 2, override for Monday 2026-07-20: the probe lands on Sunday local, `"Sun"` is not in `class_days`, so `compute_session_start_utc` returns `None` and line 516 forces `minutes_late = 0`. Every late student on the first scheduled weekday is silently recorded as on time.

These values feed tardy counts, `repeat_tardy` flags, intervention creation, and the parent portal, so the corruption propagates into the records schools act on.

**Fix:** Build the probe from the teacher's timezone rather than UTC (localize `day` in `tz_name`), and interpret `join_time` in that same timezone instead of attaching `tzinfo=timezone.utc` at line 502.

---

### [HIGH] `/auth/set-password` changes a password without the current one
**File:** `linkjoin-backend/app/routers/auth.py:274`

**What:** `set_password` accepts a new password from any confirmed session with no proof of knowledge of the existing one, and unlike `reset_password_with_token` it does not write `password_changed_at`.

**Failure scenario:** An attacker who obtains an access token (XSS against `localStorage`, a shared machine, a leaked log) posts `{"new_password":"...","confirm_password":"..."}` to `/auth/set-password`. The account password is replaced and the legitimate owner is locked out, without the attacker ever knowing the original.

The missing `password_changed_at` compounds it. `reset_password_with_token` sets that field at line 480 precisely so `_reject_if_pre_password_change` (`auth.py:52`) evicts sessions on other devices. Because `set_password` omits it, every other outstanding session, including the attacker's, survives a password change that the user performs specifically to evict an intruder.

The endpoint is deliberately in `_SELF_SERVICE_ALLOWLIST` (`auth.py:127`) so a `must_change_password` account can reach it, which is correct, but it is not restricted to that case.

**Fix:** Require and verify a `current_password` unless `user.get("must_change_password")` is set, and add `password_changed_at` to the `$set` at line 285.

---

### [HIGH] `login.username` is not unique, so registration races create duplicate accounts
**File:** `linkjoin-backend/app/main.py:97`

**What:** `register` does a check-then-insert on email (`auth.py:72-105`) with no unique constraint underneath. `main.py:97` creates `motor_db.login.create_index("username")` without `unique=True`; of the eight unique indexes declared in `lifespan`, username is not among them.

**Failure scenario:** Two `POST /auth/register` requests for the same address arrive close together, which is trivially forced by firing concurrent requests and is reachable accidentally on a double-clicked signup button across four gunicorn workers. Both pass the `find_one` at line 72, and both `insert_one` at line 105 succeed. Two `login` documents now exist for one email.

Every subsequent lookup uses `find_one({"username": email})`, which returns an arbitrary one of the two. Login (`auth.py:215`) may verify against either password hash, so whichever party set a password on the winning document controls the identity. `get_current_user` (`auth.py:101`) may resolve a token to the other document entirely, meaning role, `org_id`, and premium status can differ between the account that authenticated and the account that is authorized. The same race applies to `create_org`'s admin provisioning (`orgs.py:115`) and to the import endpoints.

**Fix:** Add `unique=True` to the username index and handle `DuplicateKeyError` at the insert as a 409. Existing duplicates must be reconciled before the index will build.

---

### [HIGH] One malformed link permanently disables every scheduled job
**File:** `linkjoin-backend/app/scheduler.py:655`

**What:** `load_all_text_jobs` iterates links and calls `_schedule_text_jobs` with no exception handling, and the interval jobs are registered only *after* that loop. `get_text_time` (`utils.py:247-248`) parses with bare `int(float(...))` and indexes `weekdays.index(d)` at line 256, both of which raise on bad data.

**Failure scenario:** A single `links` document has `time` set to `""`, `"9"`, or any non `H:MM` value, or a `days` entry outside the seven expected abbreviations. Such rows are reachable: `time` is validated on the create and update paths today, but `_validate_time` short-circuits on empty input (`models/link.py:24-25`), and documents predating validation are not retroactively checked.

At line 658 `_schedule_text_jobs` raises, the exception escapes `load_all_text_jobs`, and it propagates through `await asyncio.to_thread(load_all_text_jobs)` in `_init_scheduler` (`main.py:170`). That coroutine is launched with a bare `asyncio.create_task` at line 177 with no exception handler and no `add_done_callback`, so the traceback is swallowed entirely.

The result is that `scheduler.start()` at line 171 never runs and none of the jobs registered at lines 660-723 are ever added: absence checks, parent reminders, status checks, audit log purge, and auto-delete all stop. There is no error in the logs beyond the startup line that was already printed. One bad row in one user's link silently halts every background job for the whole platform.

**Fix:** Wrap the per-link call at line 658 in `try/except` with `log.exception` and continue, and register the interval jobs before the link loop. Separately, attach a done-callback to the `create_task` at `main.py:177` so a failed init is logged.

---

### [HIGH] Scheduler has no leader failover, and a demoted leader keeps firing jobs
**File:** `linkjoin-backend/app/scheduler.py:41`

**What:** Two defects in the Redis leader lock. `try_become_leader` is called exactly once per process, and `_renew_leadership` returns without stopping the scheduler or clearing `_is_leader` when it loses the lock.

**Failure scenario:** `startup.sh` runs `gunicorn -w 4`, so four workers race for the lock at `main.py:172`; one wins and three go permanently idle (`main.py:174-175`).

*No failover.* If the leader worker crashes or is recycled, its 30-second lock expires and nothing reclaims it. The three surviving workers already evaluated `try_become_leader` once at their own startup and never retry. Every scheduled job stops until the whole app is restarted, with no alert.

*Split brain.* If the leader stalls past the TTL (a long GC pause, a blocked event loop, a Redis blip), the lock expires. On the next tick `_renew_leadership` finds the mismatch at line 46, logs a warning, and returns at line 50. It never sets `_is_leader = False` and never calls `scheduler.shutdown()`, so that worker's `AsyncIOScheduler` keeps running every job. If a restarted worker then wins the lock, two schedulers run concurrently. Duplicated jobs include SMS reminders (`_send_sms`), truancy alerts to parents, and `auto_delete_past_links`. `send_class_reminders` is protected by an atomic upsert (line 466), but `_send_sms` has no such guard, so users receive doubled texts.

`release_leadership` is also unreachable in the crash case, since it only runs in the normal lifespan shutdown (`main.py:181-182`).

**Fix:** In `_renew_leadership`, set `_is_leader = False` and call `scheduler.shutdown()` before returning at line 50. Convert the one-shot election into a periodic background task so idle workers retry the lock on an interval.

---

## MEDIUM

### [MEDIUM] `org_disabled` is enforced only in the frontend
**File:** `linkjoin-backend/app/routers/admin.py:138`

**What:** `disable_all` writes `org_disabled` onto every matching user, but no backend endpoint or dependency ever reads it.

**Failure scenario:** A grep for `org_disabled` across the whole repo returns the write at `admin.py:146`, the echo endpoint at `admin.py:156`, and three frontend readers (`SettingsModal.jsx:23`, `useAutoOpen.js:42`, `Settings.jsx:250`). There is no check in `get_current_user`, `get_confirmed_user`, or any router.

A disabled user who calls the API directly, or simply keeps the tab open with a cached token, retains full access to links, classes, and attendance. The control is cosmetic and the admin UI reports success. Note also that the blast radius is keyed on `user["org_name"]`, which is derived from the email domain (`auth.py:91`), not on `org_id`.

**Fix:** Check `org_disabled` in `get_confirmed_user` and return 403, and key the sweep on `org_id` rather than `org_name`.

---

### [MEDIUM] Editing a link silently wipes its meeting password
**File:** `linkjoin-backend/app/routers/links.py:307`

**What:** `update_link` builds a fresh `doc` and calls `replace_one` at line 350. `replace_one` substitutes the entire document, so any field not explicitly copied into `doc` is deleted. `password` is only set when `body.password` is truthy (line 323).

**Failure scenario:** A user creates a link with a meeting password, which is stored encrypted at `links.py:279`. Later they edit the link's name or time. The frontend does not resend the password (it is a write-only field in the UI), so `body.password` is empty, the `if` at line 323 is skipped, and `replace_one` writes a document with no `password` key. The stored password is destroyed with no warning, and `_clean_items` subsequently returns `""` for it.

`org_name` (set at creation, line 276) is dropped the same way. That field is the filter for the platform-admin view at `utils.py:144` (`motor_db.links.find({"org_name": org})`), so any edited link silently disappears from that view.

The handler already demonstrates the correct pattern for exactly this problem three lines up: `link` is preserved from `existing` at line 305 when the body omits it.

**Fix:** Carry `password` and `org_name` over from `existing` when the body omits them, or switch line 350 to `update_one` with `$set`.

---

### [MEDIUM] Account deletion leaves attendance and intervention records behind
**File:** `linkjoin-backend/app/routers/users.py:505`

**What:** `delete_account` sweeps seven link and bookmark collections plus `mfa_challenges`, `parent_links`, and class rosters, but never touches `attendance`, `interventions`, `absence_alerts`, `parent_reminder_log`, or `analytics_events`, all of which key on `student_email` or `user_id`.

**Failure scenario:** A student deletes their account. `motor_db.login.delete_one` runs at line 543, but every `attendance` document carrying `student_email` survives indefinitely, as do open `interventions` holding teacher notes about them. That data remains visible: `get_class_attendance` (`attendance.py:389`) queries by `class_id` and returns those rows to teachers, now with no corresponding account. For a product handling under-13 student data under a DPA, this is an erasure gap, and the code comment at line 534 claims the referential cleanup was already completed.

Separately, the endpoint depends on `get_current_user` and requires no password or MFA re-confirmation, so a single stolen token irreversibly destroys the account and cancels its subscription.

**Fix:** Add the missing collections to the sweep, keyed on both `username` and `user_id`. Require re-authentication before destructive deletion.

---

### [MEDIUM] Inbound SMS webhook fails open and blocks the event loop
**File:** `linkjoin-backend/app/routers/messaging.py:18`

**What:** Twilio signature validation at line 25 is wrapped in `if _settings.twilio_token:`, so an unset token disables authentication entirely rather than rejecting the request. The handler is `async` but performs blocking I/O.

**Failure scenario:** `twilio_token` defaults to `""` (`config.py:13`). In any environment where it is unset or misconfigured, the validation block is skipped and `POST /messaging/receive` becomes an unauthenticated endpoint. An attacker posts a form with a spoofed `From` matching a victim's stored number and a `Body` containing a link id, and line 44 disables that victim's SMS reminders. Configuration absence should never silently remove an authentication check.

Independently, line 43 calls `sync_db.login.find_one` (blocking PyMongo) and lines 45-50 make a synchronous Twilio HTTP call, both directly inside an `async def`. Each request stalls that worker's entire event loop for the duration of the Twilio round trip. The codebase already establishes the correct pattern: `scheduler.py:169` and `:376` wrap the identical Twilio call in `run_in_executor`.

**Fix:** Fail closed when the token is unset. Use `motor_db` for the lookup and `run_in_executor` for the Twilio call.

---

### [MEDIUM] Note saving is a lost-update race with no size cap
**File:** `linkjoin-backend/app/routers/users.py:187`

**What:** `save_note` reads the whole `notes` dict, mutates it in Python, and writes it back (lines 189-192). `NoteRequest.markdown` has no length validator.

**Failure scenario:** Two note saves from the same account overlap (two tabs, or the extension and web app together, across four workers). Both read the same `notes` at line 189, each adds its own key, and the second `$set` at line 192 overwrites the first note wholesale. The user silently loses a note.

Separately, `NoteRequest` (`models/user.py`) caps nothing, and notes are stored inline in the `login` document, which `get_current_user` fetches on **every authenticated request** (`auth.py:101`). A user posting a few megabytes of markdown inflates their own auth hot path, and repeated growth eventually hits MongoDB's 16MB document ceiling, at which point the account can no longer be written to at all.

**Fix:** Write the single key with `{"$set": {f"notes.{body.id}": {...}}}` instead of read-modify-write, and add a `max_length` validator to `markdown`.

---

### [MEDIUM] Accepting any invite marks the email confirmed
**File:** `linkjoin-backend/app/routers/invites.py:274`

**What:** `accept_invite` depends on `get_current_user` (not `get_confirmed_user`) and unconditionally sets `"confirmed": "true"` at line 276.

**Failure scenario:** `student_class` invites are reusable join codes with `email: None` (line 135, 154), so the recipient check at line 271 is skipped by design. An attacker registers with an address they do not control, never clicks the confirmation email, obtains a class join code (these are shared broadly with students by nature), and posts it to `/invites/{token}/accept`. Line 276 flips `confirmed` to `"true"`, and line 299 mints a fresh access token. `is_confirmed` now passes and every `get_confirmed_user` endpoint opens up, with the account bearing an unverified email that may belong to someone else.

A secondary effect: the same write sets `role` unconditionally, so a `district_admin` who opens a student join code is demoted to `student` and loses their own org.

**Fix:** Only set `confirmed` for invite types that carry a verified email address, and skip the role write when the invite would reduce an existing higher-privileged role.

---

### [MEDIUM] History pagination truncates milliseconds and skips events
**File:** `linkjoin-backend/app/routers/links.py:208`

**What:** Timestamps are serialized with a hardcoded `.000Z` (lines 208 and 220), and that lossy string is handed back as the `next_before` cursor at line 230, then parsed as an exclusive `$lt` bound on the next request (line 169, 190-191).

**Failure scenario:** The last event on page one has a true timestamp of `12:00:00.750`. Line 208 formats it as `12:00:00.000Z` and line 230 returns that as `next_before`. Page two queries `{"$lt": 12:00:00.000}`, which excludes every event in the window `[12:00:00.000, 12:00:00.750]`. Those events appeared on neither page. Under normal load, links opened within the same second as the page boundary vanish from the history feed, and because both `open_log` and `audit_logs` are cursored on the same truncated value, the loss hits both streams.

**Fix:** Emit full microsecond precision with `.isoformat()` and cursor on that value.

---

### [MEDIUM] Redis outage silently disables token revocation
**File:** `linkjoin-backend/app/auth.py:95`

**What:** The JTI blacklist check is wrapped in `except Exception` that logs and allows the request through.

**Failure scenario:** Redis becomes unreachable. Every token blacklisted by `/auth/logout` (`auth.py:496`) is accepted again, as is every consumed password-reset and email-confirmation token. A user who logs out on a shared machine to evict a session gets no protection for the duration of the outage. The fail-open is deliberate and documented, and the tradeoff is defensible for availability, but it is worth stating explicitly: logout is not a security boundary while Redis is down.

Note this interacts with finding 3, where the org router skips the blacklist check unconditionally rather than only during an outage.

**Fix:** Accept the tradeoff but alert on the log line at 96, or fail closed for the small set of high-value endpoints. The password epoch check (`auth.py:105`) is the durable fallback and correctly reads from MongoDB.

---

### [MEDIUM] Platform admin view loads entire collections into memory
**File:** `linkjoin-backend/app/utils.py:139`

**What:** In the `admin_view` branch of `configure_data`, three of the four queries have no filter at all, and all four use `.to_list(None)`.

**Failure scenario:** Lines 144-146 execute `motor_db.deleted_links.find()`, `motor_db.bookmarks.find()`, and `motor_db.deleted_bookmarks.find()` with empty predicates and no limit, pulling every document in those collections, for every user in the system, into one worker's memory. `configure_data` is called on the WebSocket connect path (`main.py:325`) and after most link mutations, so a single platform admin with `admin_view` enabled toggling their session can exhaust worker memory as the collections grow.

The `links` query at line 143 is at least filtered by `org_name`, which makes the three unfiltered siblings look like an oversight rather than intent.

**Fix:** Scope the three queries by `org_name` to match line 143, and apply an explicit limit instead of `to_list(None)`.

---

### [MEDIUM] Nested N+1 queries across the attendance read paths
**File:** `linkjoin-backend/app/routers/orgs.py:513`

**What:** Several hot read paths issue one query per student inside a loop over classes, with no batching.

**Failure scenario:** `get_org_attendance` loops over every class in the org (line 513), and for each class loops over the roster issuing `motor_db.login.find_one` per student (line 516), then calls `compute_student_attendance_rate` per student (line 525), which itself runs another `attendance.find` (`attendance.py:119`). For an org with 50 classes averaging 25 students, that is roughly 2,500 sequential round trips in one request.

The same shape appears at `get_class_patterns` (`attendance.py:662`), `get_leak_signal` (`orgs.py:572`), `classes.py:_resolve_students` (line 49), and the scheduler's `check_absences` (`scheduler.py:335`) and `send_class_reminders` (`scheduler.py:447`), the last two running every five minutes across every class in the platform.

**Fix:** Replace the per-student `find_one` with a single `find({"user_id": {"$in": student_ids}})` per class, and have `compute_student_attendance_rate` accept pre-fetched records rather than querying per student.

---

### [MEDIUM] One duplicate alert aborts the remaining students in a class
**File:** `linkjoin-backend/app/scheduler.py:398`

**What:** `check_absences` guards against re-alerting with a non-atomic `find_one` at line 348 followed by `insert_one` at line 398, against a collection carrying a unique index on `(class_id, student_email, date)` (`main.py:124-126`). The `try` block spans the entire per-class student loop (lines 308-408).

**Failure scenario:** The job runs every five minutes with a 30-to-90-minute eligibility window (line 321), so roughly a dozen executions overlap the same class-day, and after finding 10 two schedulers may run concurrently. Two runs both pass the `find_one` at 348 for the same student, and the second `insert_one` at 398 raises `DuplicateKeyError`.

Because the `except` is attached to the outer class loop at line 407, the exception unwinds past every remaining student in that class. Students later in `student_ids` get no absence alert at all that day, and the failure surfaces only as one log line naming the class rather than the students who were skipped.

**Fix:** Replace the check-then-insert with an atomic upsert on the dedupe key, matching the pattern already used correctly in `send_class_reminders` at line 466, and move the `try` inside the student loop.

---

### [MEDIUM] CSP allows `unsafe-inline` while the token lives in localStorage
**File:** `linkjoin-backend/app/main.py:58`

**What:** `script-src 'self' 'unsafe-inline'` permits arbitrary inline script execution, which removes most of the CSP's value as an XSS mitigation. The access token is stored in `localStorage` (`AuthContext.jsx:10`, `api/client.js:6`) and is therefore readable by any script that executes.

**Failure scenario:** Any injection that lands in the page executes under `unsafe-inline`, reads `lj_token`, and exfiltrates a bearer token valid for seven days (`access_token_expire_minutes: 10080`, `config.py:31`). The token cannot be revoked reliably during a Redis outage (finding 18), and finding 7 lets the holder change the account password outright.

The React surfaces themselves are clean: both `dangerouslySetInnerHTML` uses (`NotesModal.jsx:83`, `Notes.jsx:114`) pass through `DOMPurify.sanitize` with explicit allowlists, the extension escapes consistently via `escHtml`/`escAttr`, and `users.py:229` sanitizes server-side with `nh3`. This finding is about the depth of the fallback, not a known injection.

**Fix:** Remove `'unsafe-inline'` from `script-src` and adopt a nonce or hash. Consider moving the token to an httpOnly cookie, or shortening its lifetime and adding refresh.

---

## LOW

### [LOW] Admin token compared non-constant-time
**File:** `linkjoin-backend/app/routers/orgs.py:43`
**What:** `x_admin_token == _settings.add_accounts_token` uses `==`, which short-circuits on the first differing byte.
**Failure scenario:** A remote attacker measures response-time differences across candidate prefixes to recover a long-lived static admin token byte by byte. Network jitter makes this impractical over the internet, but the token grants org creation and admin provisioning, so the low cost of fixing it outweighs the low probability.
**Fix:** `secrets.compare_digest(x_admin_token or "", _settings.add_accounts_token)`.

### [LOW] Shipped extension manifest still has a placeholder OAuth client id
**File:** `linkjoin-extension/manifest.json:13`
**What:** `"client_id": "REPLACE_WITH_CHROME_EXTENSION_OAUTH_CLIENT_ID.apps.googleusercontent.com"`.
**Failure scenario:** Any user invoking `chrome.identity` Google sign-in from the extension hits an invalid client id and the flow fails. The backend is ready for it (`google_chrome_client_id` is an accepted audience at `auth.py:293`), so this is purely an unfilled build placeholder in the packaged artifact.
**Fix:** Substitute the real client id at build time, and fail the extension build if the placeholder string is still present.

### [LOW] Debug endpoint `/health/client-ip` exposed in production
**File:** `linkjoin-backend/app/main.py:237`
**What:** An unauthenticated endpoint reflecting `x-forwarded-for`, `x-client-ip`, `x-forwarded-proto`, and the socket peer.
**Failure scenario:** The docstring marks it `TEMPORARY` and asks the operator to hit it on prod and delete it; it is still mounted. It discloses internal proxy topology to anonymous callers. The underlying issue it documents is real and worth noting: because forwarded headers are not trusted, `request.client.host` is the load balancer for every request, so the rate limiter (`limiter.py:14`, keyed on `get_remote_address`) buckets all users into one counter and audit-log IPs are meaningless.
**Fix:** Delete the endpoint and configure `--forwarded-allow-ips` in `startup.sh`.

### [LOW] Unsafe `minutes_late` accessor inconsistent with the rest of the codebase
**File:** `linkjoin-backend/app/routers/users.py:386`
**What:** `r.get("minutes_late", 0) > tardy_threshold` returns `None` when the key exists with a null value, and `None > int` raises `TypeError` on Python 3.
**Failure scenario:** Latent rather than currently reachable. The query at line 363 filters on `opened_at >= cutoff`, which excludes the absent-override rows where `minutes_late` is null, so no live path appears to trigger it today. It is worth fixing because every other comparison in the codebase uses the null-safe idiom `(r.get("minutes_late") or 0)` (`attendance.py:98`, `:127`, `:226`, `:718`, `:316`); this line is the sole exception, which suggests it was missed rather than reasoned about, and any future change to that filter turns it into a 500.
**Fix:** Use `(r.get("minutes_late") or 0)`.

### [LOW] Unbounded attendance scan on the rewards endpoint
**File:** `linkjoin-backend/app/routers/attendance.py:290`
**What:** `motor_db.attendance.find({"student_email": email})` has no date cutoff and no limit, unlike every comparable read which bounds on `_LOOKBACK_DAYS`.
**Failure scenario:** Every record the student has ever accumulated is loaded into memory and sorted in Python on each call to `/attendance/me/rewards`, which the student profile page hits on load. Growth is unbounded across school years.
**Fix:** Add a cutoff, or cap with `.limit()` after sorting in Mongo.

### [LOW] Excused-absence endpoint accepts arbitrary student emails
**File:** `linkjoin-backend/app/routers/classes.py:257`
**What:** `add_excused_absence` pushes `body.student_email` into the class's `excused_absences` array without checking roster membership.
**Failure scenario:** An authorized teacher submits any string, and it is stored on the class document. Since access is already gated to that class, the impact is data hygiene rather than disclosure: unbounded array growth on the class document and excusal entries for non-members that quietly skew `effective_expected` in the rate math at `attendance.py:135-139`.
**Fix:** Validate `student_email` against the resolved roster before the `$addToSet`.

### [LOW] Phone numbers stored via `int()`, mangling leading zeros
**File:** `linkjoin-backend/app/routers/users.py:128`
**What:** `{"$set": {"number": int(digits)}}` stores the phone number as an integer; the same pattern is at `auth.py:103`.
**Failure scenario:** International numbers whose national portion begins with `0` lose that digit permanently, and no length ceiling is enforced, so an arbitrarily long digit string is accepted. Downstream this reaches Twilio as `to=f"+{number}"` (`scheduler.py:165`), which then fails to deliver. Storing a phone number as an integer is the root problem.
**Fix:** Store as a normalized `str`. Note this needs a migration, since `messaging.py:38` looks up by `int`.

### [LOW] Password reset email states the wrong expiry
**File:** `linkjoin-backend/app/routers/auth.py:431`
**What:** The email body reads "This link expires in 30 minutes" while `reset_token_expire_minutes` defaults to `60` (`config.py:32`).
**Failure scenario:** Cosmetic only. Users who believe an unexpired link is dead request another, and support reasons from a stated policy the system does not implement.
**Fix:** Interpolate `_settings.reset_token_expire_minutes` into the string.

---

## Checked and clean

These were investigated and produced no finding. Recorded so the same ground is not re-covered.

- **Mongo injection.** No string-concatenated queries anywhere. All predicates are built as dicts with parameterized values. The one regex query, `admin.py:275`, correctly wraps user input in `re.escape`. No `$where`, no `mapReduce`, no user-controlled operator keys.
- **Cross-org scoping in `integrations.py`.** Every Clever, OneRoster, and Canvas endpoint taking an `org_id` path or query parameter verifies `user.get("org_id") != org_id` immediately after its role gate (lines 672, 689, 697, 960, 977, 985). This is the one router where the org check is applied consistently.
- **Stripe webhook.** Signature verified with `construct_event` before any parsing, and replay is prevented by an insert against a unique `_id` with a `DuplicateKeyError` short-circuit (`billing.py:64-78`).
- **Google OAuth audience binding.** `/auth/google-token` uses `tokeninfo` rather than `userinfo` specifically to obtain `aud`, validates it against a set that filters empty strings so an unset env var cannot act as a wildcard (`auth.py:291-328`), and checks `email_verified`.
- **Frontend and extension XSS.** Both `dangerouslySetInnerHTML` call sites sanitize through DOMPurify with explicit tag and attribute allowlists. The extension escapes every interpolation in `popup.js` and `content.js` via `escHtml`/`escAttr`. Server-side markdown goes through `nh3.clean`.
- **Password hashing and login timing.** Argon2 via `PasswordHasher`, with a precomputed dummy hash verified on the unknown-user path to equalize timing (`auth.py:28`, `:217-222`).
- **SPA path traversal.** The catch-all at `main.py:300` resolves the candidate and checks `is_relative_to` against the dist root before serving.
- **`await get_redis()` at `main.py:275`.** Flagged during review as a probable `TypeError`, since every other call site treats `get_redis()` as synchronous. Verified against the installed redis 8.0.0 that `Redis.__await__` exists and returns the client, so `/health/ready` works. Not a bug, though the inconsistency is worth normalizing.
- **`delete_link` unbound local.** The expression `doc.get("name", "") if not permanent else ""` at `links.py:382` appeared to reference `doc` on a path where it is never assigned. Python evaluates conditional expressions lazily, so the `doc` branch is not evaluated when `permanent` is true. Not a bug.
- **Share recipient fan-out.** `ShareLinkRequest` dedupes and caps recipients at 10 before the handler runs (`models/link.py:139-152`), so the email loop at `links.py:462` cannot be used for bulk sending.
