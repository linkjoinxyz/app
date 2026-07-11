# k12-evaluation.md Remediation Status

**Purpose:** Track which action items from the k12.com fit evaluation have been addressed and what remains.

---

## Status Key
- Done
- Partial
- Not done

---

## Immediate (Blocks Pilot)

### 1. FERPA/COPPA compliance documentation and DPA — Done
- `/dpa` route → `DPA.jsx` (13-section DPA, effective 2026-06-28)
- `/privacy-schools` → `PrivacySchools.jsx` (FERPA role, COPPA school consent exception, data residency)
- `/breach-policy`, `/subprocessors` routes also exist
- 24-month audit log retention documented in DPA section 6
- Data residency documented: Azure US West + MongoDB Atlas US region
- **Gap:** DPA and school privacy links are NOT in the main app footer (only Privacy Policy and ToS are linked). Compliance pages exist but are not discoverable without a direct URL. No FERPA/COPPA badges on homepage.

### 2. Google OAuth / SSO integration — Partial
- Google OAuth implemented: `/auth/google-code` and `/auth/google-token` in `auth.py`
- Works for both Chrome extension and web app flows
- **Missing:** SAML/OIDC (needed for enterprise/district SSO without Google Workspace dependency); MFA not enforced for admin accounts; no Google Workspace Admin SDK for bulk rostering via OAuth

### 3. Firefox AMO extension publication — Not done
- Firefox extension code exists at `linkjoin-extension-firefox/` (v0.3.1, gecko ID set)
- Chrome extension on Web Store is v0.3.2
- AMO submission has never been made; no publish scripts or CI/CD for it
- Explicitly called out as a pilot blocker in the evaluation

### 4. Written SLA — Not done
- Status page exists at `/status` (90-day uptime tracking, incident management, response time)
- Incident management backend fully built (`incidents.py`, P0-P3 severity, timeline)
- `IncidentBanner` component shows active incidents on all app pages
- **Missing:** No published SLA document with uptime %, RTO/RPO targets, or maintenance window policy. The evaluator requires "99.5% minimum uptime with defined response windows" in writing.

---

## Short-Term (Before Broad Rollout)

### 5. Bulk CSV import for teachers and admins — Done
- Backend: `POST /orgs/{org_id}/import-staff` in `admin.py`
- Fields: `email` (required), `role`, `first_name`, `last_name`
- Frontend: file upload modal in `AdminDashboard.jsx` with preview table, per-row status, template download
- Creates accounts with temp passwords, sends welcome emails, logs audit events

### 6. Unified interventions and attendance dashboard — Partial
- Interventions tab exists at org level in `AdminDashboard.jsx` (`OrgInterventionList` component)
- Meeting Open Log tab also exists at org level
- **Missing:** No org-level attendance view. Attendance data is only visible per-class inside the class detail view (teacher perspective). Admins cannot see attendance across all classes in one place. The evaluation called for "one source of truth for both teachers and admins."

### 7. Parent portal with class visibility, attendance, absence submission — Partial
- Parent portal exists at `/parent` (`ParentPortal.jsx`)
- Shows child's classes with attendance rate, flags, stats (last 28 days)
- Shows attendance history (last 100 records, read-only)
- **Missing:** No absence submission — parents can view but not submit excuses or request approvals. No class schedule times displayed in full. No interactive communication log. The evaluation asked for "portal or app with absence history and communication log."

### 8. Bulk parent import linked to student accounts — Partial
- Backend: `POST /orgs/{org_id}/import-parents` in `admin.py`
- CSV fields: `parent_email`, `student_email`; creates `parent_links` collection entries
- **Limitation:** Requires `admin == "true"` (platform admin only), not accessible to school admins. School admins cannot use this directly — it is only in `OrgDetail.jsx` for platform admin use.

### 9. Guided onboarding flow for new school admins — Done
- `AdminOnboarding.jsx` on `/onboarding` route
- Step 1: Org profile (name, type, city, website, timezone)
- Step 2: Invite staff (bulk email invites with role selection)
- Step 3: Set password (if `must_change_password` flag set)
- Step 4: Done screen
- Progress indicators, back navigation, form state preserved across steps, sign-out button

---

## Medium-Term (Scale Readiness)

### 10. SIS integration (PowerSchool / Infinite Campus) — Partial
- OneRoster integration exists (`integrations.py`): OAuth2-based, supports PowerSchool, Infinite Campus, Skyward
- Syncs classes and students into LinkJoin
- **Missing:** No direct native PowerSchool or Infinite Campus API (only OneRoster protocol). No attendance writeback to SIS. No SIS-sourced grade passback.

### 11. LMS integration (Canvas / Schoology / Teams) — Partial
- **Canvas:** Fully implemented — OAuth, course mapping, roster sync, attendance gradebook sync
- **Google Classroom:** Fully implemented — OAuth, roster sync, attendance sync
- **Clever:** Fully implemented — district-wide OAuth, full roster sync
- **Missing:** Schoology (listed as future). Microsoft Teams (not implemented). No LTI integration.

### 12. MFA for admin accounts — Partial
- SMS-based MFA exists (`mfa.py`): 6-digit codes via Twilio, 10-min expiry, 3 resends/session, audit logged
- Users can enable/disable via `PATCH /users/mfa`
- **Missing:** MFA is optional for all users — no enforcement for admin or platform_admin roles. No TOTP/authenticator app (SMS-only is vulnerable to SIM swap). No backup codes.

### 13. Audit log export and retention policies — Partial
- `GET /admin/audit-logs/export.csv` in `admin.py` — CSV download, date/action filters, 10K record limit, email/IP masking
- Paginated audit log view endpoint also exists
- 24-month retention documented in DPA section 6
- **Missing:** No automated retention job that purges logs older than 24 months. No tamper-proofing. Only CSV format (no JSON export). The DPA commitment is not enforced in code.

### 14. Public API documentation — Not done
- FastAPI auto-generates `/docs` (Swagger) and `/redoc` at runtime — not explicitly disabled
- **Missing:** Not publicized anywhere, no README section on API access, no authentication instructions for external developers, no checked-in OpenAPI schema file, no versioning policy. The auto-generated docs are an implementation detail, not a public API offering.

---

## Summary

| # | Item | Status | One-line gap |
|---|------|--------|-------------|
| 1 | FERPA/COPPA/DPA | Done | Pages exist; not linked from footer |
| 2 | Google OAuth/SSO | Partial | OAuth works; SAML/admin enforcement missing |
| 3 | Firefox AMO publication | Not done | Code ready; never submitted |
| 4 | Written SLA | Not done | Status page exists; no SLA document |
| 5 | Bulk CSV import (staff) | Done | Full implementation |
| 6 | Unified interventions/attendance | Partial | No org-level attendance view |
| 7 | Parent portal | Partial | Read-only; no absence submission |
| 8 | Bulk parent import | Partial | Exists but platform admin only |
| 9 | Admin onboarding | Done | 4-step flow complete |
| 10 | SIS integration | Partial | OneRoster covers it; no direct SIS APIs |
| 11 | LMS integration | Partial | Canvas/Classroom/Clever done; Schoology/Teams not |
| 12 | MFA for admins | Partial | Optional SMS MFA; no admin enforcement |
| 13 | Audit log export/retention | Partial | Export done; no automated purge job |
| 14 | Public API docs | Not done | Auto-generated only; not publicized |

**Done: 3** (items 1, 5, 9)
**Partial: 8** (items 2, 6, 7, 8, 10, 11, 12, 13)
**Not done: 3** (items 3, 4, 14)

---

## Highest-Leverage Remaining Work

These close the most pilot-blocking gaps with the least effort:

1. **Firefox AMO submission** — Extension is code-complete (v0.3.1). Needs to be submitted to addons.mozilla.org. Unblocks Firefox-using staff.
2. **Written SLA** — Draft a 1-page document with 99.5% uptime commitment, RTO (2h), RPO (24h), and maintenance windows, published at `/sla`. No code required.
3. **Footer compliance links** — Add DPA, privacy-schools, and subprocessors links to the app footer. Makes compliance posture discoverable.
4. **MFA enforcement for admin roles** — Add a check in the login flow that requires MFA if `role === 'school_admin'` or `admin === 'true'`. Backend `mfa.py` is already built.
5. **Absence submission in parent portal** — Add a simple form to `ParentPortal.jsx` that POSTs an absence request. Closes the largest functional gap in the parent portal.
6. **Org-level attendance view** — Add an "Attendance" tab to `AdminDashboard.jsx` showing aggregate attendance across all org classes. Data is already available via existing endpoints.
7. **Bulk parent import for school admins** — Relax the `admin == "true"` check in `import-parents` to allow `school_admin` role, and add the UI to `AdminDashboard.jsx`.
8. **Audit log retention job** — Add a scheduler job to `scheduler.py` that purges `audit_logs` older than 24 months, matching the DPA commitment.
