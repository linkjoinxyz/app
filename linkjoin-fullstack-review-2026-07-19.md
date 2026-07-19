# LinkJoin Full-Stack Review

**Scope covered:** all 21 backend routers (~10k LOC), core frontend context/pages, extension auto-open path, scheduler, CI/CD, tests. Traced end-to-end: personal signup→link→auto-open; student join→attendance→teacher view; parent portal→attendance history; teacher→flag→intervention.

**Headline:** the single most important school-product feature — parent absence alerts — has been throwing an unhandled `NameError` on every execution since 2026-07-17. Separately, attendance can be forged by any student with one API call, five class-mutation endpoints are missing their cross-org check, and three marketing-page integrations don't exist in the codebase at all.

---

## Segment 1: Personal free user

**What they actually get:** Signup (email+password or Google), unlimited links, bookmarks, notes, browser extension that auto-opens meetings at start time, 14-day Premium trial granted automatically at signup (`routers/auth.py:80-82`).

### Findings

**1.1 — Google access-token login accepts tokens minted for any OAuth client — CRITICAL**
`routers/auth.py:377-396`. `/auth/google-token` takes a raw `access_token`, calls Google's `userinfo` endpoint, and mints a LinkJoin session for whatever email comes back. Unlike `/auth/google-code` and `/register`, which use `id_token.verify_oauth2_token()` (checks the `aud` claim at line 58, 204, 323), this path performs **no audience validation**.

*Failure scenario:* Attacker runs any unrelated app with Google sign-in and `email` scope. A LinkJoin user signs into that app. The attacker takes the resulting access token, POSTs it to `/auth/google-token`, and receives a valid 7-day LinkJoin JWT for the victim's account. This is the textbook OAuth confused-deputy; Google documents it explicitly. Full account takeover with no user interaction beyond signing into an unrelated site.

**1.2 — Trial expiry never revokes premium settings; Open Early and Vacation Mode are free forever — HIGH (revenue)**
Write-side gating is correct: `routers/users.py:127,135,143` call `require_premium` before setting `open_early`, `auto_delete_past`, `vacation_mode`. But nothing ever *clears* those fields when entitlement lapses, and `GET /users/me` (`routers/users.py:34-40`) returns the whole user document with no entitlement filter. The extension consumes them raw — `hooks/useAutoOpen.js:40` (`if (u.vacation_mode) return`), `:43` (`parseInt(u.open_early)`), `:86` (`if (userRef.current?.auto_delete_past)`).

*Failure scenario:* Sign up → 14-day trial starts automatically → set Open Early to 15 minutes → let the trial lapse → `require_premium` now rejects *changes*, but `open_early: 15` is still on the document and `useAutoOpen.js` still honors it. Every user who ever touched these settings during their free trial keeps them permanently. Given the trial is granted to 100% of signups, this is the default outcome, not an edge case.

Note the asymmetry: `scheduler.py:459` *does* re-check `require_premium` inside `auto_delete_past_links`, so the server-side job stops correctly — but the client-side delete-on-open at `useAutoOpen.js:86` does not, so the feature keeps working anyway.

**1.3 — `/links/share` is an unauthenticated-content email relay — HIGH**
`routers/links.py:418-461` + `models/link.py:137-140`. `ShareLinkRequest` is `{link: dict, emails: list[str], type: str}`. `link` is an arbitrary client-supplied dict (not the validated `CreateLinkRequest`), `emails` has no length cap and no format validation, there is no ownership check on the link, and no rate limit. `send_email` is called synchronously in a loop (line 454) with an attacker-controlled subject line: `f"LinkJoin - {link.get('name','')} shared with you"`.

*Failure scenario:* One authenticated account POSTs `{link: {id: 1, name: "<pitch text>", link: "https://evil"}, emails: [10000 addresses]}`. LinkJoin sends 10,000 emails from `noreply@linkjoin.xyz` with attacker-chosen subject and body. Domain reputation burns; the request also blocks a worker for 10,000 sequential SMTP round-trips. Because `name` bypasses the 200-char validator that `CreateLinkRequest.validate_name` applies, newline injection into the Subject header is also reachable.

**1.4 — `/links/addlink` cache-miss path decrypts the entire links collection — MEDIUM-HIGH**
`routers/links.py:469-478`. If `share_token` doesn't match, it falls through to `async for doc in motor_db.links.find({...})` and Fernet-decrypts every legacy doc's `share` field. No rate limit.

*Failure scenario:* `GET /links/addlink?id=x` in a loop. Each request is a full collection scan plus N decryptions. A few concurrent requests saturate the two gunicorn workers.

**1.5 — Password reset does not invalidate existing sessions — HIGH**
`routers/auth.py:518-541`. `reset_password_with_token` blacklists only the *reset token's* own jti. Access tokens live 7 days (`config.py:28`, `access_token_expire_minutes: 10080`) and there is no per-user token epoch.

*Failure scenario:* Attacker steals a token (XSS, shared machine, the OAuth issue above). Victim notices and resets their password. Attacker retains full access for up to 7 more days. The reset accomplished nothing. Same gap in `/auth/set-password` (`:273`), which additionally does not require the current password.

**1.6 — `DELETE /users/me` does not cancel the Stripe subscription — HIGH (billing/legal)**
`routers/users.py:452-464`. Deletes links, bookmarks, and the login doc. Never touches `stripe_subscription_id`.

*Failure scenario:* Paying user deletes their account. Stripe keeps charging $5/month. The user cannot log in to reach the Billing Portal, and no webhook fires because nothing was canceled. Charges continue indefinitely until a chargeback. Also incomplete for GDPR/CCPA: leaves `attendance`, `parent_links`, `audit_logs`, `mfa_challenges`, `analytics_events`, and dangling `classes.student_ids` entries.

**1.7 — Rate limiter is in-memory and keyed on the wrong IP — HIGH**
`app/limiter.py:4`: `Limiter(key_func=get_remote_address)` with no `storage_uri`. Two consequences:
- No shared storage → each of the 2 gunicorn workers keeps its own counters. `5/minute` is really `10/minute`, and everything resets on deploy.
- `get_remote_address` reads `request.client.host`, which behind Azure's load balancer is the LB, not the user. Every user shares one bucket.

The same bug corrupts the audit trail: `log_audit(..., ip=request.client.host)` at `routers/auth.py:119,131,248` records the load balancer's IP on every entry. For a product whose DPA promises audit logs, the forensic value is zero.

---

## Segment 2: Personal Premium user

**What they get:** the above plus Open Early, Vacation Mode, Auto-Delete, calendar import, AI email meeting detection, $5/mo via Stripe Checkout.

**2.1 — Recovering from a failed payment leaves the user locked out permanently — HIGH**
`routers/billing.py:106-116`. `customer.subscription.updated` only acts when status is `canceled` or `unpaid` (→ sets `premium_status: "expired"`). There is no handler for the transition *back* to `active`, and `invoice.payment_failed` / `invoice.paid` aren't handled at all.

*Failure scenario:* Card expires → Stripe marks subscription `unpaid` → LinkJoin sets `expired`. User updates their card in the Billing Portal → Stripe sets subscription back to `active` → LinkJoin ignores the event. The user is now paying full price with `premium_status: "expired"`, permanently, and `/billing/checkout` will let them create a *second* subscription (line 20 only blocks when status is already `"active"`, which it isn't). Double billing with no premium access.

**2.2 — No webhook idempotency — MEDIUM**
`routers/billing.py:60-118`. Signature verification is correct (line 65), but there is no `event.id` dedupe table. Stripe retries on any non-2xx, and this handler returns 200 unconditionally at line 118 even when the user lookup fails (line 94 just logs a warning). A `checkout.session.completed` for an unrecognized customer is acknowledged and lost forever — the customer paid and never gets premium, with only a log line.

**2.3 — Institutional accounts can buy a subscription they already have — MEDIUM**
`routers/billing.py:20` blocks only `premium_status == "active"`. Institutional users have no `premium_status` at all (`roles.py:24-25` short-circuits them to entitled). A teacher clicking Upgrade in the UI gets a real Stripe Checkout and pays $5/mo for features `require_premium` already grants free. Grandfathered users likewise.

**2.4 — `premium` field is dead weight and a trap — LOW**
`"premium": "false"` is written at 11 sites (`auth.py:79,337,407`, `orgs.py:121`, `admin.py:321,408,495,582`, `integrations.py:565,888,1521`) and read **nowhere**. Any future code that reasonably checks `user["premium"]` will conclude every user on the platform, including active subscribers, is not premium.

---

## Segment 3: Student

**3.1 — Any student can forge their own attendance — CRITICAL**
`routers/attendance.py:190-213`. `POST /attendance` requires only that `link_id` belongs to the caller. `class_id` and `minutes_late` come **straight from the request body** with no roster check, no schedule check, and no server-side lateness computation.

Compare the intended path, `GET /links/c/{slug}` (`routers/links.py:63-141`), which correctly verifies roster membership (line 78), computes `minutes_late` from the class schedule server-side (line 101), and de-duplicates by `record_date` (line 92-97).

*Failure scenario:* Student opens devtools and runs:
```
POST /attendance {"link_id": <any of their own link ids>, "class_id": "<their class>", "minutes_late": 0}
```
They are now marked present and on time for a class they never joined. The forged row omits `source`, `record_date`, and `recorded_at`, so `get_class_attendance` defaults it to `source: "linkjoin_click"` at line 328 — **indistinguishable from a genuine join** in the teacher UI, the CSV export, the leak-signal report, and the intervention flagging. The entire attendance product rests on this endpoint being closed.

**3.2 — Students can redirect their own truancy alerts — CRITICAL**
`routers/users.py:219-241`. `PATCH /users/parent-contact` with no `student_user_id` falls to `target = {"username": user["username"]}` (line 232) — the caller edits their own `parent_phone` / `parent_email`. `check_absences` reads exactly those fields off the student's login doc (`scheduler.py:248`).

*Failure scenario:* Student sets `parent_email` to a burner address. Every future absence alert goes to the student, not the parent. No notification, no audit log entry, no admin visibility.

**3.3 — The redirect-only URL redaction is defeated by the endpoint that serves it — CRITICAL**
The attendance-integrity design redacts raw meeting URLs from class-linked docs (`utils.py:66-98`, `_clean_items` pops `link` when `class_id` is set). But `GET /links/c/{slug}` returns `{"url": <decrypted>, "password": <decrypted>}` (`routers/links.py:135-141`) to **any confirmed user**, with the attendance write happening only `if user.get("role") == "student"` (line 75) and every failure path still returning the URL (lines 121-141, by explicit design per the docstring).

*Failure scenario:* Student calls their own class's `/links/c/{slug}` once from curl, saves the Zoom URL and password, and joins directly for the rest of the year. Zero attendance records generated. The `joined_outside_linkjoin` leak signal (`attendance.py:152-170`) only counts *teacher-entered overrides*, so this leaves no trace at all.

**3.4 — Rewards are gated on `require_premium`, which is wrong for this feature — MEDIUM**
`routers/attendance.py:218`. Institutional students pass (`roles.py:24-25`). But a personal-account student with an expired trial gets a 403 on their own streaks page. A K-12 motivation feature behind a $5/mo paywall for exactly the students whose schools haven't bought in.

**3.5 — Streaks use a fifth, more permissive counting rule and are trivially gameable — MEDIUM**
`get_my_rewards` (`attendance.py:216-307`) is the only attendance surface that does **not** call `_resolve_latest_records`. Line 249: `date_on_time = any(ml <= tardy_threshold for ml in by_date[d])` — if any record on a day is on-time, the day counts. Combined with finding 3.1, a student POSTs one extra `minutes_late: 0` record per day and holds a perfect streak indefinitely while actually being absent.

---

## Segment 4: Parent

**4.1 — Absence alerts have never fired since 2026-07-17 — CRITICAL**

`app/scheduler.py:241-243`:
```python
hour12 = h % 12 or 12
ampm = "AM" if h < 12 else "PM"
class_time_display = f"{hour12}:{m:02d} {ampm}"
```
`h` and `m` are never assigned in `check_absences`. Verified by disassembly — both compile to `LOAD_GLOBAL`, and scheduler.py has no module-level `h` or `m`:
```
LOCALS: ('datetime','timezone','timedelta','motor_db','now_utc','today_date','cls',
         'class_days','class_time_str','teacher','tz_name','class_start_utc','delta',
         'org','brand_name','hour12','ampm',...)
GLOBAL/free loads of h,m:  LOAD_GLOBAL h / LOAD_GLOBAL h / LOAD_GLOBAL m
```
The `h, m = ...` parsing was removed when commit `6c6bce8` (2026-07-17, *"Fix admin/parent attendance-rate consistency, add parent class reminders"*) replaced inline time parsing with `compute_session_start_utc`. The display lines were left behind.

*Failure scenario:* Every 5 minutes the job runs. The moment any class with `family_alerts: True` enters its 30-90-minute post-start window and today isn't a blackout date, line 241 raises `NameError`. The exception propagates out of the `async for cls` loop, so the **entire run aborts** — classes later in the iteration are never evaluated either. No parent has received an absence alert in two days. Because `absence_alerts` rows are only written after the alert (line 309), there's no backfill: those absences are silently lost forever. APScheduler logs it, but nothing pages on it.

This is the flagship claim of the schools product ("Absence and tardiness notifications to parents", `School.jsx:384`) and it is completely dead.

**4.2 — Parent attendance history ignores teacher corrections — HIGH**
`routers/parent.py:168-178`. Records are pulled with `{"opened_at": {"$gte": cutoff}}` and collapsed with `records_map.setdefault(...)` — first cursor row wins, arbitrary order. This is the only attendance read in the codebase that skips `_resolve_latest_records`.

Two consequences: absent/excused overrides have `opened_at: None` by design (`attendance.py:457`), so they're **excluded by the query entirely**; and when multiple rows exist for a day, an arbitrary one is shown.

*Failure scenario:* Child is marked absent by mistake. Parent calls. Teacher fixes it with an override. Parent refreshes the portal and still sees "Absent." There is no way for the parent to see the correction.

**4.3 — Parents see fabricated absences for every school holiday and all summer — HIGH**
`routers/parent.py:190-195` builds `scheduled_dates` from weekday pattern alone over a **365-day** window (`_LOOKBACK_DAYS = 365`, line 14) and never consults `get_blackout_set`, which every teacher-facing surface does use (`attendance.py:360,576,832`).

*Failure scenario:* Parent logs in during September. The Attendance tab shows ~60 "Absent" events spanning July and August, plus every holiday. This is the primary parent-facing screen.

**4.4 — Parent portal contradicts itself on what counts as tardy — HIGH**
Same file, two tabs, two thresholds:
- `get_child_classes` line 111: reads the org's configured `tardy_threshold_minutes` correctly.
- `get_child_attendance` line 214: `"type": "tardy" if ml > 5 else "on_time"` — **hardcoded 5**.

*Failure scenario:* School sets threshold to 10 minutes. Classes tab says the child has 0 tardies. Attendance tab lists every 6-minute-late join as "Tardy." Parent escalates to the teacher over a number the school explicitly configured away.

**4.5 — Any teacher with an empty `org_id` can read every family's private notes — HIGH**
`routers/parent.py:292-297`:
```python
elif role in ("school_admin","district_admin","teacher"):
    if user.get("org_id") and stu.get("org_id") != user.get("org_id"):
        raise HTTPException(403)
```
If the caller's `org_id` is `""` or absent — which happens for any staff account created outside the org-import flow — the guard short-circuits and **no check runs at all**. Even with a valid `org_id`, any teacher in the org can read any student's notes; unlike `get_student_profile` (`users.py:284-290`) there is no "your own classes" restriction. These notes contain family medical and personal excuse details.

**4.6 — Opt-in class reminders are silently overridden by a teacher-facing switch — MEDIUM**
`scheduler.py:328` gates `send_class_reminders` on `classes.family_alerts`, the same flag that gates absence alerts and that a teacher toggles from `AdminDashboard.jsx:436`. A parent who explicitly opted in via `PATCH /parent/settings` gets nothing, sees "enabled" in their settings, and has no way to discover why.

**4.7 — Reminder de-duplication is racy and unindexed — MEDIUM**
`scheduler.py:370-371` does `find_one` then `insert_one` on `parent_reminder_log`, non-atomically. That collection has **no index at all** — it's absent from the 46 indexes in `main.py:89-145`. With 2 workers (see 7.3) both running the job on the same 5-minute tick, both read "not sent" and both send. Parents get duplicate texts. The 5-minute-wide window (`8 <= minutes_until <= 13`, line 341) against a 5-minute interval also means any scheduling drift silently drops the reminder entirely — `misfire_grace_time=3600` makes it worse, since a late run recomputes `minutes_until`, finds itself out of window, and skips.

---

## Segment 5: Teacher

**5.1 — Attendance table shows fabricated absences for any class larger than a few students — HIGH**
`routers/attendance.py:324`: `.find({"class_id": class_id}).sort("opened_at",-1).limit(200)`. Everything not in those 200 rows is then synthesized as an **absent row** by the fill loop at lines 368-394.

*Failure scenario:* 30-student class, 4 sessions/week, 28-day lookback ≈ 480 expected records. The query returns the most recent 200 — roughly 7 days. Every student is displayed as absent for the preceding three weeks. Worse, MongoDB sorts nulls lowest, and absent/excused overrides have `opened_at: None`, so **teacher corrections are the first thing dropped by the cap.**

**5.2 — `/at-risk` uses different thresholds than `/patterns` and ignores org configuration — HIGH**
`routers/interventions.py:177-180` re-declares `_TARDY_THRESHOLD_MINUTES = 5`, `_TARDY_RATE_FLAG = 0.33`, `_ATTENDANCE_RATE_FLAG = 0.5`, `_MIN_SESSIONS_TO_FLAG = 3` as module constants and **never reads `orgs.attendance_settings`** — unlike `get_class_patterns`, which loads all five from org config at `attendance.py:577-581`.

`/at-risk` additionally: does no `_resolve_latest_records` dedup (overrides *add* sessions instead of replacing them); ignores `excused_absences` entirely; ignores blackout dates in its `expected` count (line 247-250); and omits the `not r.get("excused")` condition that `/patterns` applies at line 660.

*Failure scenario:* School sets tardy threshold to 10 min and attendance flag to 0.7. The Patterns view honors it. The At Risk tab silently uses 5 and 0.5. The two lists disagree about which children need intervention, and the org's configured policy is applied in one place and ignored in the other. This is the same class of defect as the three attendance-rate calculations already fixed — it survived because it lives in a different router.

**5.3 — Assigned intervention cases 403 for the assignee — HIGH**
`routers/interventions.py:167-170`, `_assert_access`, requires `cls.teacher_id == user.user_id` for role `teacher`. But `get_class_patterns` has an explicit escape hatch for assignees (`attendance.py:559-566`), and the assignment flow emails the assignee a "View case" button (`interventions.py:86`).

*Failure scenario:* Admin assigns a counselor to a case for another teacher's class. Counselor gets the email, sees the case in `?mine=true` (line 280-284 bypasses the org filter), clicks it → `GET /interventions/{id}` → 403. The core intervention workflow is unusable across class boundaries — which is the only reason to have assignment at all.

**5.4 — `assigned_to` accepts any string; student PII is emailed to arbitrary addresses — CRITICAL**
`routers/interventions.py:403-404`: `updates["assigned_to"] = body["assigned_to"] or None`. No validation that the value is a teacher, in the org, or a LinkJoin user. Line 429-434 then sends `_assignment_email_html`, which embeds the **student's name, class, and attendance flag type** (lines 66-78).

*Failure scenario:* Any teacher PATCHes `{"assigned_to": "anyone@anywhere.com"}`. LinkJoin emails that address: "Emma Rodriguez — Algebra II — Low attendance." Unauthenticated disclosure of an identifiable minor's attendance-risk record to an arbitrary third party. Straight FERPA violation, and a second spam vector.

**5.5 — Teachers see a student's full cross-class record — MEDIUM-HIGH**
`routers/users.py:284-290` correctly restricts *which* students a teacher may open. But the data returned is unscoped: `recent_attendance` queries by `student_email` with no class filter (line 317), and `interventions` returns every open case across all classes (line 349-353), including other teachers' case notes.

**5.6 — CSV export is injectable — MEDIUM-HIGH**
`routers/attendance.py:885,897`. `excuse_reason` and `note` are free text written raw into CSV. A value beginning `=`, `+`, `-`, or `@` executes as a formula on open in Excel. These files go to school admins and get imported into SIS workflows.

**5.7 — No audit trail on intervention reads or writes — MEDIUM**
`interventions.py` contains zero `log_audit` calls. Attendance exports and overrides are logged (`attendance.py:520,903`), but reading and writing case notes about children — the most sensitive data in the product — produces nothing.

---

## Segment 6: School Admin

**6.1 — Five class-mutation endpoints are missing the cross-org check — CRITICAL**
`routers/classes.py`. Every class endpoint checks `teacher_id` for role `teacher`. Only *some* also check `org_id` for role `school_admin`/`district_admin`:

| Endpoint | Line | Teacher check | Org check |
|---|---|---|---|
| `GET /classes/{id}` | 102 | ✅ 106 | ✅ 108 |
| `GET /classes/{id}/links` | 116 | ✅ 120 | ✅ 122 |
| `DELETE /classes/{id}` | 149 | — | ✅ 153 |
| `POST /classes/{id}/excuse-absence` | 275 | ✅ 279 | ✅ 281 |
| `DELETE /classes/{id}/excuse-absence` | 293 | ✅ 297 | ✅ 299 |
| **`PUT /classes/{id}`** | **135** | ✅ 139 | ❌ **missing** |
| **`POST /classes/{id}/students`** | **166** | ✅ 170 | ❌ **missing** |
| **`DELETE /classes/{id}/students/{uid}`** | **204** | ✅ 208 | ❌ **missing** |
| **`POST /classes/{id}/links/{lid}`** | **223** | ✅ 227 | ❌ **missing** |
| **`DELETE /classes/{id}/links/{lid}`** | **256** | ✅ 260 | ❌ **missing** |

*Failure scenario:* A school_admin at District A obtains any `class_id` from District B (they leak through `/orgs/{org_id}/members`, see 6.3, and through intervention documents). They can then rename that class, change its schedule, silently disable `family_alerts` (killing that school's parent notifications), unenroll students, or push their own meeting link into the class — which `_push_link_to_student` (line 24-39) distributes to every student in it. Multi-tenant isolation is broken for writes.

**6.2 — Teachers can enroll arbitrary strangers and start collecting data on them — CRITICAL**
`routers/classes.py:175-180`. `add_students` resolves each entry by `user_id` **or** `username` against the global `login` collection, with no org check on the resolved student.

*Failure scenario:* Teacher POSTs `{"student_ids": ["victim@gmail.com"]}`. Any LinkJoin user on the platform — a personal user, a student at another district — is silently enrolled. `_push_link_to_student` inserts the class's meeting link into their account, and LinkJoin begins recording their attendance and generating intervention flags on them. No consent, no notification, no org boundary.

**6.3 — `parental_consent.token` is served to school staff, enabling COPPA consent self-grant — HIGH**
`routers/orgs.py:178` returns members with only `{"password": 0}` projected out. `routers/admin.py:211` and `routers/users.py:34-40` do the same. The document includes `parental_consent.token`, and `GET /consent/grant?token=...` (`consent.py:82`) requires **only** that token.

*Failure scenario:* A school admin pulls `/orgs/{org_id}/members`, reads a under-13 student's consent token, hits the grant URL, and the account activates. The audit record at `consent.py:102-107` logs the school's IP as the granting party. The verifiable-parental-consent control is bypassable by the very party it exists to constrain. The same projection also exposes `stripe_customer_id`, `mfa_phone`, `refer`, and users' private `notes`.

**6.4 — The org Attendance tab reports on-time rate labeled as attendance rate — HIGH**
Two independent sites compute the same wrong thing:
- `routers/orgs.py` (`get_org_attendance`): `"attendance_rate": round(on_time / total * 100)`
- `routers/attendance.py:799` (`get_class_attendance_summary`): `"attendance_rate": round(c["on_time"] / c["sessions"] * 100)`

Both divide on-time joins by *sessions attended*, never by sessions *expected*. Neither matches `compute_student_attendance_rate` (`attendance.py:140`), which is `total / effective_expected` and is what teachers and parents see.

*Failure scenario:* A class where every student attends every session but half arrive 6 minutes late reads **50% attendance** to the school admin. A student who attended 1 of 20 sessions, on time, reads **100%**. The admin escalates on the first and misses the second. This is the fourth and fifth disagreeing implementation of "attendance rate."

**6.5 — Emailed temp passwords for the highest-privilege school role never expire — MEDIUM-HIGH**
`routers/orgs.py:113-140`. `create_org` generates a 12-char password, hashes it, sets `must_change_password: True`, and emails the plaintext. `must_change_password` is returned to the client (`auth.py:268`) and stored in `AuthContext` (`AuthContext.jsx:87-89`) — there is **no server-side enforcement anywhere**. The password has no expiry.

*Failure scenario:* School admin ignores the change-password prompt. A password that sat in an email inbox in plaintext remains a permanent credential for the account that governs all student PII in that org.

**6.6 — MFA on admin accounts is optional in practice, unrate-limited, and its resend is broken — HIGH**

Three separate defects in `routers/mfa.py`:

- **No enforcement.** `auth.py:251`: `force_mfa = user.get("mfa_enabled") or (is_admin_role and user.get("number"))`. An admin who never adds a phone number never sees MFA. `mfa_setup_required` is returned to the client and enforced only in the UI.
- **No brute-force protection.** `/auth/mfa/verify` (line 47) has no `@limiter.limit`, no failed-attempt counter, and does not invalidate the challenge on failure — it stays `used: False` for its full 10-minute TTL. A 6-digit code with unlimited guesses. Comparison at line 74 is also non-constant-time.
- **Resend permanently locks out after 4 lifetime logins.** Line 122 reads `payload.get("iat_str", "2000-01-01T00:00:00+00:00")`, but `create_token` (`auth.py:17-22`) sets `iat`, never `iat_str`. The fallback always applies, so the count spans all challenges since the year 2000. After a user's 4th MFA challenge ever, `/auth/mfa/resend` returns 429 forever.

Compounding: `_send_mfa_code` swallows all Twilio exceptions (line 42-43) and returns normally. If Twilio is unconfigured or fails, login returns `mfa_required: True`, no SMS arrives, and resend is 429. The admin is locked out with no error message and no self-service path.

**6.7 — `parental_consent` "Already granted" check has a TOCTOU window — LOW-MEDIUM**
`consent.py:88-101` reads status, then updates. Two concurrent clicks both pass. Harmless today; would matter if grant became side-effecting.

---

## Segment 7: District Admin

**7.1 — The district tier does not exist — CRITICAL (product)**
`School.jsx:299` advertises *"District admin view: all schools in one place."* `parent_org_id` is written at `orgs.py:91` and listed as an updatable field at `admin.py:224`, and is **read nowhere in the backend** (verified by grep across `linkjoin-backend/app/`).

Every scoped query is a flat `{"org_id": user.get("org_id")}` — `classes.py:61`, `interventions.py:190`, `orgs.py:459`, `admin.py:624`. There is no traversal from a district org to its child school orgs.

*Failure scenario:* A district_admin whose `org_id` points at the district org sees **zero classes, zero students, zero interventions** — every child record has a school's `org_id`, not the district's. To see anything they must be assigned a single school's `org_id`, at which point they are indistinguishable from a school_admin. The advertised district rollup is not partially built; it is absent.

**7.2 — `district_admin` grants read access to every org on the platform — CRITICAL**
`routers/orgs.py:175` and `:186`:
```python
if user.get("org_id") != org_id and user.get("role") != "district_admin":
    raise HTTPException(403)
```
The `district_admin` escape hatch has **no `parent_org_id` constraint**. Any district_admin can read any org's record and full member list — for every district on the platform, not just their own.

*Failure scenario:* District A's admin calls `GET /orgs/{any_org_id}/members` and receives every user document (minus password) for a competitor district: student emails, names, parent contact details, and `parental_consent.token` values. Combined with 6.3, they can then grant consent on those students' accounts. `org_id` is a 128-bit token, but IDs leak through intervention documents, class documents, and any support interaction.

**7.3 — Two gunicorn workers each run a full private scheduler — HIGH**
`Dockerfile:16-18`: `gunicorn -w 2 -k uvicorn.workers.UvicornWorker`. Each worker executes `lifespan` (`main.py:84-159`), which calls `load_all_text_jobs()` and `scheduler.start()`. `scheduler.py:12` uses `MemoryJobStore()`. There is no leader election and no cross-process lock.

Every job runs twice:
- **SMS link reminders** — duplicate texts to every user, every occurrence.
- **`send_class_reminders`** — the `find_one`/`insert_one` dedup at `scheduler.py:370-371` is not atomic and `parent_reminder_log` has **no index at all**. Duplicate parent notifications.
- **`check_absences`** — accidentally protected by the unique index on `absence_alerts` (`main.py:121-123`); the loser raises an uncaught `DuplicateKeyError` and aborts its run.
- **`record_status_check`** — duplicate rows, inflating the public status page's sample count.

Separately, `create_text_job` is called inline from request handlers (`links.py:270,339`) into the **serving worker's** in-memory scheduler only. The other worker never learns about the job until restart.

*Failure scenario:* User creates a reminder. It fires once (from worker A) until the next deploy, then fires twice (both workers reload from DB). Reports of "sometimes double, sometimes missing" texts have exactly this shape.

Also note `create_text_job` calls `sync_db.login.find_one` (`scheduler.py:110`) — a **blocking PyMongo call on the event loop** — on every link create, update, toggle, and restore.

---

## Segment 8: Platform Admin

**8.1 — Two different platform-admin guards in one file — MEDIUM**
`admin.py:136-138` defines `_require_admin` with a puzzling carve-out: `user.get("admin") != "true" or user.get("org_name") == "gmail.com"`. It's used by 3 endpoints (`:143,164,173`). Seven other endpoints inline a bare `if user.get("admin") != "true"` (`:205,218,235,250,265,275,290`), silently dropping the gmail condition. Whatever the gmail rule is for, it applies to a third of the surface.

**8.2 — User search is a ReDoS and a PII firehose — MEDIUM-HIGH**
`admin.py:273-286`. `q` is interpolated raw into `{"$regex": q, "$options": "i"}` — unescaped and unanchored. `q=(a+)+$` pins a worker. Results are full user documents minus password, including every user's private `notes`, `parental_consent.token`, `mfa_phone`, and `stripe_customer_id`. No `log_audit` call on the search.

**8.3 — `delete_org` is the source of the dangling references already observed — HIGH**
`admin.py:288-300` deletes the org document and demotes members. It leaves `classes`, `attendance`, `interventions`, `parent_links`, `parent_notes`, and `absence_alerts` with `org_id` values pointing at nothing. `classes.py:147-161` (`delete_class`) has the same shape — it detaches links but leaves `attendance` and `interventions` orphaned.

This is the mechanism behind both artifacts already found: dangling interventions referencing deleted classes, and orgs with students but no classes. The permissive fallback at `attendance.py:539` (`if cls:` — skip the access check entirely when the class is missing) then lets **any teacher from any org** mutate records belonging to those orphans.

**8.4 — The status page cannot detect most outages — MEDIUM**
`scheduler.py:410-427`, `record_status_check`, pings MongoDB and records `ok`. That is the entire signal.

*Failure scenario:* Redis is down (JWT revocation silently no-ops — `auth.py:49-50` swallows it), Gmail SMTP is rejecting, Stripe webhooks are 500ing, `check_absences` has been crashing for 48 hours, Twilio is failing. Status page: **all green**. Every one of these fails silently by design — `log_audit` swallows exceptions (`audit.py:47-48`), `track_event` swallows (`utils.py:47-48`), `_send_mfa_code` swallows (`mfa.py:42-43`), `send_email` in `share_link` swallows (`links.py:455-456`). `run_backup_health_check` (`scheduler.py:484`) is named for backups but only counts documents — it verifies nothing about backups existing or being restorable.

---

# Technology

*Written for an engineer new to this codebase.*

## Backend architecture
FastAPI + Motor (async MongoDB) + a parallel sync PyMongo client for the scheduler (`database.py`). 21 routers registered flat in `main.py:182-201`. Auth is a bearer JWT via `HTTPBearer`; `get_current_user` (`auth.py:35`) decodes, checks a Redis jti blacklist, and loads the user document, which is then passed as a plain dict to every handler.

Authorization is **not** dependency-injected. `roles.py` exposes `require_teacher`/`require_school_admin`/`require_district_admin`/`require_premium` as plain functions called imperatively as the first line of a handler body, and the **org-scoping check is hand-written separately in each handler**. That is why finding 6.1 exists: with ~40 places each needing the same 2-line idiom, five of them just don't have it. The fix is structural — a `Depends`-based `require_class_access(class_id)` that returns the class or raises, used everywhere — not five one-line patches.

Input validation is inconsistent at the trust boundary. Some handlers take Pydantic models with validators (`models/link.py` is genuinely good). Others take bare `body: dict` — `interventions.py:321,385,471`, `attendance.py:191`, `users.py:44,51,71,80,149,212`, `admin.py:173,217,234`, `orgs.py:228,353,418`. Every finding involving unvalidated input traces to a `body: dict` signature.

## Data model
MongoDB, ~20 collections, no schema enforcement. 46 indexes are created idempotently on startup (`main.py:89-145`), which is reasonable coverage — with two notable gaps: `parent_notes` and `parent_reminder_log` have **no indexes at all** despite both being queried on every parent portal load and every 5-minute reminder tick.

Implicit assumptions that nothing enforces:
- `classes.student_ids` → `login.user_id` — no FK, never cleaned on user delete.
- `interventions.class_id` → `classes.class_id` — no FK, never cleaned on class delete.
- `*.org_id` → `orgs.org_id` — no FK, never cleaned on org delete.
- `attendance.student_email` → `login.username` — email is the join key here, but `user_id` is the join key in `classes`, `parent_links`, and `interventions`. **The same entity is referenced two different ways depending on collection**, which forces the N+1 email↔user_id resolution loops at `attendance.py:617-622`, `:787-790`, `:838-841`, `orgs.py`, and `classes.py:47-53`.
- `login.confirmed` is the string `"true"`/`"false"`, not a boolean, and `is_confirmed` (`auth.py:65-70`) deliberately treats *missing* as confirmed — but `mfa.py:85` uses `user.get("confirmed") == "true"` directly, so a legacy user who completes MFA login is told to confirm an email the backend already considers confirmed.

## Scheduler
`AsyncIOScheduler` with `MemoryJobStore`, started per-process from the lifespan hook. Six registered jobs (`scheduler.py:544-607`): `absence-check` (5min), `parent-reminder-check` (5min), `status-check` (5min), `backup-health-check` (weekly), `audit-log-purge` (monthly), `auto-delete-past-links` (daily), plus one cron job per user SMS reminder loaded from the DB at startup.

Job state is entirely in-process memory. See 7.3 — with `-w 2` this is the single most consequential architectural problem in the deployment. `audit-log-purge` also duplicates the TTL index at `main.py:104`; harmless, but two mechanisms for one policy.

## Frontend
React + Vite, one `AuthContext` (`context/AuthContext.jsx`) holding token/role/orgId/premiumStatus, hydrated from `localStorage` and refreshed from `/users/me` on token change. The context is well-built and honestly commented — lines 33-35 explicitly state that `isPremium` is UX-only and that real gating lives in `require_premium`, and the `isPremium` expression (lines 36-39) faithfully mirrors `roles.py:23-33` including the institutional short-circuit. The previously-fixed premium-badge leak was addressed correctly here.

The gap isn't that client gating is trusted — it's finding 1.2: the server gates the *write* but the client is the only thing that ever *reads* entitlement at the point of effect (`useAutoOpen.js`), and nothing revokes the stored setting when entitlement lapses.

`AdminDashboard.jsx` is 4,150 lines in one file. `pages/` totals 21.7k LOC across 44 files with no shared data layer, which is why the same metric gets recomputed per page.

## Third-party integrations
- **Stripe** — signature verification is correct (`billing.py:65`). No idempotency, incomplete event coverage (see 2.1, 2.2).
- **Twilio** — every send is a fresh `Client()` construction inside a thread executor. No opt-out (STOP) handling anywhere. `_normalize_number` (`auth.py:34-40`) prepends the country code when `len(digits) < 11`, which mangles most non-NANP numbers.
- **Google** — three separate login paths with three different verification postures (see 1.1).
- **Gmail SMTP** — `email_service.py` opens a new `SMTP_SSL` connection per message, synchronously, with no timeout, no retry, no bounce handling, and no queue. Gmail's relay limit is ~500–2,000/day. **A single district doing daily absence alerts for 3,000 students exceeds the platform's total email capacity.** This is a hard ceiling on the schools business, independent of any bug.
- **SIS/LMS syncs** — Clever (`_run_clever_sync:440`, with pagination and a cooldown), OneRoster (`:754`), Canvas (`:1067`), and Schoology (`:1394`) are all genuinely implemented, each with a public sync endpoint. ClassLink is the only advertised connector with no implementation. *(An earlier draft of this review claimed Canvas/Schoology/OneRoster were absent — that was a truncated-grep error, corrected in punch-list item 7.)*

## Deployment & CI/CD
- `deploy-backend.yml` builds and pushes `:latest` to Docker Hub on push to `main`. **No `needs:` dependency on the test workflow** — a red build deploys. This is how the `check_absences` NameError shipped.
- **Only the `:latest` tag is pushed.** No SHA tag means there is no rollback artifact; reverting requires rebuilding an old commit.
- Azure does not auto-pull; a manual restart is required. Confirmed still true, still undocumented in the workflow itself.
- Vercel: `.vercel/` exists with no Git integration; frontend deploys are manual `vercel --prod`. Confirmed still true. Combined with the backend's separate pipeline, **frontend and backend can silently diverge** — there is no version handshake between them.
- `test-backend.yml` points `MONGO_URI` at the real Atlas cluster with `MONGO_DATABASE: linkjoin_test`. Tests share a cluster with production.
- The CSP set in `SecurityHeadersMiddleware` (`main.py:54-62`) applies to API responses. The app is served from Vercel, so the CSP does not protect the pages it was written for.

## Testing
43 tests against 178 endpoints. Existing tests are good where they exist — `test_premium_gating.py` and `test_users_premium_gating.py` correctly cover the trial/institutional matrix, `test_billing_webhook.py` has 7 cases.

The gaps line up exactly with the findings above. Routers with **zero** test coverage: `interventions`, `orgs`, `integrations`, `invites`, `mfa`, `consent`, `incidents`, `messaging`, `contact`, `bookmarks`. That is every router holding cross-org access control, plus MFA, plus COPPA consent.

`test_scheduler.py` has 5 tests, all covering `auto_delete_past_links` and `_send_sms` vacation-mode logic. **`check_absences` and `send_class_reminders` have no tests.** A single test asserting `check_absences` completes without raising against one fixture class would have caught the outage on the commit that introduced it.

## Security summary
JWT: HS256, 7-day expiry, Redis jti blacklist on logout — but the blacklist failure mode is open (`auth.py:49-50` swallows Redis errors and proceeds), and password reset doesn't revoke. Passwords: argon2, with correct timing equalization on the login path (`auth.py:217-221`). Encryption: single static Fernet key for meeting URLs and passwords, no rotation. Audit: HMAC-SHA256 tamper-evidence keyed on `jwt_secret` — but nothing ever verifies the hashes, no verification endpoint exists, and the IP field is the load balancer's.

---

# Prioritized punch list

Ranked by impact × reach, not by effort.

**1. Fix `check_absences` — `h`/`m` are undefined** (`scheduler.py:241-243`)
Derive from `class_start_utc` (already computed at line 229) instead of resurrecting the parse. Add one test that runs the job against a fixture class. Every school customer's headline feature has been dead for two days and is losing data permanently.

**2. Close `POST /attendance`** (`attendance.py:190-213`)
Either delete it — `/links/c/{slug}` already does this correctly and safely — or add roster verification, server-side `minutes_late`, and `record_date` dedup. Until this is closed, no attendance number in the product is trustworthy, and the entire school offering is unsound.

**3. Add the missing org checks to the five class endpoints** (`classes.py:135,166,204,223,256`) and scope `add_students` to the caller's org (`:175-180`)
Do it as a `Depends`-based helper, not five inline patches — the inline pattern is what produced the gap. Cross-tenant write access plus the ability to enroll arbitrary strangers.

**4. Set `-w 1` on gunicorn, or move the scheduler out of the web process** (`Dockerfile:16-18`)
One-line mitigation available today. Correct fix is a separate scheduler container or a persistent jobstore with leader election. Fixes duplicate SMS/reminders, halves the effective rate limits back to configured values, and makes `create_text_job` deterministic.

**5. Fix the parent portal's three data defects** (`parent.py:168-178`, `:190-195`, `:214`)
Use `_resolve_latest_records`, apply `get_blackout_set`, read the org's tardy threshold. Parents are currently shown fabricated summer absences, uncorrected records, and a threshold the school explicitly configured away. This is the most-viewed screen by the least technical audience and it damages trust in the whole product.

**6. Remove `/auth/google-token` or add audience verification** (`auth.py:377-396`)
Account takeover. `/auth/google-code` already does this correctly — either route it through `verify_oauth2_token` or delete the endpoint.

**7. Correct the marketing page** (`School.jsx`)

> **CORRECTION (2026-07-19, after publication).** This item originally claimed that
> Canvas, Schoology, and OneRoster had "zero occurrences" in `integrations.py`. **That was
> wrong.** The grep behind it was piped through `head -30`, and the first 30 matches were
> all Clever, so the truncated output was misread as absence. All three are fully
> implemented: `_run_canvas_sync` (`integrations.py:1067`), `_run_oneroster_sync` (`:754`),
> `_run_schoology_sync` (`:1394`), each with a matching public sync endpoint. The
> "Google Classroom, Canvas, and Schoology imports" and "OneRoster-compatible" claims are
> **accurate**. Corrected list below.

Claims that do not survive verification:
- **"Clever and ClassLink roster sync"** — Clever is real (`_run_clever_sync:440`).
  **ClassLink has zero occurrences** in the backend. Half the claim is unsupported.
- **"District admin view: all schools in one place"** — `parent_org_id` is written
  (`orgs.py:91`) and read nowhere; every scoped query is a flat `org_id` match. No district
  rollup exists. (Verified with an untruncated grep across `linkjoin-backend/app/`.)
- **"Configurable notification preferences per student"** — preferences live on the parent
  account (`parent_reminders_sms`/`_email`), not per student. A parent with two children
  cannot differentiate.
- **`School.jsx:56`: `const target = 10000`** — the trust bar animates to a hardcoded
  "10,000+ classes tracked", unconnected to any data source.
- "CSV export ready to import into PowerSchool or Infinite Campus" is a claim about file
  format, not an integration; the exported columns are LinkJoin's own and neither SIS
  ingests them without mapping. Worth softening, but it is not a missing-code issue.

The district-rollup and hardcoded-counter items are the ones with procurement exposure.

**8. Fix the premium revocation path** (`users.py`, `useAutoOpen.js`)
Either clear `open_early`/`vacation_mode`/`auto_delete_past` when entitlement lapses, or filter them out of `GET /users/me` for non-entitled users. Every trial user currently keeps paid features forever — the default outcome for 100% of signups.

**9. Consolidate the five attendance-rate implementations**
`compute_student_attendance_rate` (`attendance.py:103`) is the correct one. Replace: `get_class_attendance_summary:799`, `get_org_attendance` (`orgs.py`), `get_student_profile` (`users.py:326-346`), `get_at_risk_students` (`interventions.py:177-264`), and `get_my_rewards` (`attendance.py:249`). Move the org-settings load into the shared function so nobody can forget it. Then delete the duplicated threshold constants in `interventions.py:177-180`. Until this is one function, the fix you already applied three times will regress a fourth.

**10. Fix the MFA cluster before the next school onboards** (`mfa.py`)
Rate-limit `/verify`, invalidate the challenge on failure, fix `iat_str` → `iat` at line 122, surface Twilio failures instead of swallowing them, and enforce `must_change_password` and `mfa_setup_required` server-side. Right now the accounts guarding K-12 student PII have brute-forceable MFA that most admins can opt out of by not entering a phone number, and a resend button that permanently 429s after four logins.

---

**Two things worth calling out separately**, because they're structural rather than individual bugs:

The `body: dict` handler signature is the common ancestor of findings 1.3, 5.4, 3.1, and 8.2. Where a Pydantic model exists, the input is sound; where it doesn't, it isn't. That's a mechanical sweep worth doing in one pass.

And the "same metric computed twice" pattern isn't converging — it's spreading. You fixed three attendance-rate calculations; I found two more (`get_class_attendance_summary`, `get_org_attendance`), plus a fourth tardy threshold (`parent.py:214`), a fifth streak-counting rule (`get_my_rewards`), a second flagging engine that ignores org config (`get_at_risk_students`), and two different platform-admin guards in the same file. Each was added by someone doing the locally reasonable thing in a new file. Extracting the shared function *after* the divergence has been the pattern so far; the cheaper move is a single `attendance_metrics.py` that owns all of it and that new surfaces have to import to get a number at all.
