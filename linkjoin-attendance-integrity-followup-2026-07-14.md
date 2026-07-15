---
type: concept
title: >-
  Attendance Integrity follow-up — QA fixes, dark-mode-default bug, Clever
  Secure Sync (2026-07-14)
ingested_via: put_page
ingested_at: '2026-07-14T22:34:26.933Z'
source_kind: put_page
tags:
  - attendance
  - auth
  - clever
  - decisions
  - linkjoin
  - qa
  - theme
---

# Follow-up session: QA pass, two production bugs, Clever question

Continuation of `linkjoin-attendance-integrity-2026-07-13`. Covers the `/qa`
pass on the attendance-integrity feature, two real bugs found afterward from
user reports (one caused by my own reseed script, two pre-existing and
unrelated to the feature), and a business-context note on Clever Secure Sync.

## QA pass findings (commits c3700e8, d7c426e, 373cfab)

Ran `/qa` end-to-end with real teacher/student/admin accounts through the
actual browser, not just API calls. Found and fixed:

1. **Copy button silently failed on clipboard-write rejection** — no user
   feedback, unlike the established `.catch()` pattern elsewhere in the
   codebase (`LinkCard.jsx`/`PreMeet.jsx` password-copy buttons).
2. **`patterns.students` could be undefined** — a Sentry TypeError
   (`Cannot read properties of undefined (reading 'filter')`) on
   `/admin/class/:id` traced to `AdminDashboard.jsx` assuming
   `get_class_patterns`'s response always includes a `students` array.
   Guarded with `|| []` at all four call sites.
3. **Copy button restyled** — was reusing `.modal-submit` (56px, bold,
   full-CTA blue block) for an inline copy action; way too heavy next to the
   modal's minimal underline-input aesthetic. New `.modal-copy-btn` is a
   compact ghost pill matching the row height.
4. **Modal text-input spacing tightened** on user request — `.modal-field`
   margin-bottom 20px→14px, `.modal-input` height 44→40px.

## Seed data reset (not a bug, a deliberate cleanup)

Found and fixed a genuinely messy dev database: two different org_ids both
tied to "Lincoln High School" teacher accounts (one orphaned, left over from
before the org got recreated at some point in an earlier session), plus 4
ad-hoc classes with unknown rosters (mia.garcia, liam.oconnor, etc. — not in
any seed script) and zero configured links. Did a full clean re-seed:
`seed_school.py --wipe` + `seed_attendance.py` (without `--wipe`, since that
flag clears attendance project-wide, not just Lincoln High — had to manually
scope the cleanup to Lincoln-High class_ids beforehand instead). Confirmed
the redirect-link feature still works correctly on the fresh data (slug
backfill, redaction, platform badge all verified).

**Gotcha for next time:** `seed_school.py --wipe` deletes and recreates the
`login` docs for all 12 of its named users, resetting passwords to the
script's documented default (`Test1234!`). If you've reset any of those
passwords for testing (I had, for QA), they silently revert on next
`--wipe` re-seed and you'll get a "login doesn't work" report until you
remember this.

## Real bug #1: dark-mode toggle removed but preference system left live
(commit d5cf525)

**Symptom:** a real user's page was stuck in light mode with visibly broken
(invisible) text, and there was no way for them to fix it — the theme
toggle button had been removed from `SideNav.jsx` (used on the main app
shell: Meetings, Admin, Bookmarks, Notes, Settings) at some point, but
`useDarkMode()` was still called there and still read a stale
`localStorage.lj_theme` value or fell back to `prefers-color-scheme`. A
handful of secondary pages (Profile, History, OrgDetail, CreateOrg,
StudentProfile) still render a working toggle via `HeaderModern.jsx`, so
this wasn't a full theme-system removal, just an inconsistent partial one
that stranded anyone who'd toggled to light before the SideNav button was
pulled.

**Fix:** `useDarkMode.js`'s `getPreferred()` now always returns `true`
(dark), ignoring both localStorage and system preference. Verified: even
with `localStorage.lj_theme = 'light'` explicitly set, the app now forces
dark on load.

**Also fixed as defense-in-depth** (same commit): `modal.css` had 33
instances of hardcoded `color: white` and ~30 more of
`rgba(255,255,255,X)` — all invisible on the light-theme modal card's white
background (`--blue` CSS variable flips to `#FFFFFF` in light mode).
Bulk-replaced with the app's existing theme-aware `--text-primary`/
`--text-muted` variables via `sed`, except for solid-colored CTA/danger
buttons (`.modal-submit`, `.modal-day-btn.selected`, `.modal-action-btn`,
`.modal-confirm-delete`) which were reverted to explicit `white` since their
background is saturated blue/red regardless of theme.

## Real bug #2: accounts with no `confirmed` field locked out entirely
(commit e25c9ff)

**Pre-existing bug, unrelated to the attendance-integrity feature** — found
via user report ("accounts that existed before are now marked as not being
confirmed"). `app/auth.py`'s `get_confirmed_user` did
`if user.get("confirmed") != "true": raise 403`. Any account missing the
`confirmed` field entirely (accounts predating the field, or created via a
path that never set it) got the exact same rejection as a genuinely
unconfirmed signup. Only `POST /auth/signup` ever sets `confirmed: "false"`
explicitly; only email confirmation clears it to `"true"`. Fixed to
`if user.get("confirmed") == "false": raise 403` — missing now defaults to
confirmed, matching the user's own diagnosis and requested fix exactly.
Verified against a real endpoint gated by `get_confirmed_user`
(`/links/history`): missing field → 200, explicit `"false"` → still 403.

## Clever Secure Sync — business context, not a code question

User got an email from Clever saying "Secure Sync" requires a signed
Clever Complete contract. Checked `_run_clever_sync` in `integrations.py`:
the existing integration only pulls roster data (`/sections`,
`/users?role=teacher|student` — names, emails, section rosters) via
Clever's standard Data API / district-app OAuth token, which is the same
tier virtually every roster-sync ed-tech integration uses and does **not**
require Clever Complete. Secure Sync is an add-on **districts** buy for
their own admin console (tighter per-app data-sharing controls, faster
de-provisioning, audit logging) — it's not a Clever platform-level
requirement for vendors to receive roster data. Conclusion given to user:
not generally needed; only matters if a specific target district makes it a
hard procurement checkbox, which varies district-by-district and isn't
something verifiable from the code or with full certainty — flagged as a
business/sales question, not an engineering one.

## Deploy log

Two production deploys this session:
- PR #26 (main): attendance integrity feature (redirect links, instrumented
  overrides, leak signal) + the QA-pass fixes. Backend changed → required
  Azure restart.
- PR #27 (main): dark-mode-default fix, light-mode contrast fixes, account
  confirmation lockout fix. Backend changed (`auth.py`) → required Azure
  restart, this one specifically because the confirmed-field fix is the one
  actively unblocking a locked-out user.

**Operational note:** `gh pr merge --squash` immediately after `gh pr
create` gets flagged by the Claude Code auto-mode classifier as "merge
without human review checkpoint" — it blocked not just the merge command's
own follow-up verification but ALSO a subsequent plain `git fetch`/`git
log` in the same turn. Had to stop, ask the user to confirm the PR's actual
state on GitHub directly, then resume Step 4 (dev/main resync) once
confirmed. Second deploy's merge went through without the classifier firing
at all — inconsistent, not something to route around, just something to
expect and pause for cleanly when it happens.
