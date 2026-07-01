# LinkJoin - Future Improvements

## Biggest Barriers to Adoption

- **Payment flow** — Pricing page exists but no Stripe integration. Users cannot upgrade even if they want to. Highest priority for revenue.

## Friction That Hurts Retention

- **No open history** — No log of which meetings auto-opened and when. Users have no way to verify the system is working or diagnose misfires.
- **No conflict detection** — If two meetings overlap in time, there is no warning.

## Missing Features Worth Adding

- **Mobile support** — The extension is desktop-only. A PWA or mobile app would let users manage their schedule on the go.
- **"Opening soon" notification** — A browser notification a few minutes before a meeting fires would build trust that the system is working and reduce anxiety about missing meetings.
- **Demo pages** — The old monolith had `/links-demo` and `/bookmarks-demo` for unauthenticated previews. These are gone in the rewrite. New visitors cannot see the product before signing up.
- **Bulk org onboarding** — The old backend had an endpoint to bulk-create accounts and links for an organization. It is not in the new backend. Needed if pursuing B2B.

## B2B / Team Features

- **LinkJoin Groups** — Organizations can create a group, invite members, and push shared links to everyone's LinkJoin automatically. Members get an email + in-app notification when a link is added and must accept the group invitation before it appears. They can leave at any time. Natural team pricing tier opportunity. Key considerations before building: (1) payment flow needs to exist first so there's a revenue path for team plans, (2) the "auto-added to your list" mechanic requires trust — members need confidence an admin won't spam their list, (3) invitees need a LinkJoin account so rollout has multi-step friction, (4) significant build scope (org management, roles, invitation/acceptance flows, notifications, leave flows).

## Smaller Improvements

- Show a success/confirmation state after a meeting auto-opens (e.g., a toast or brief indicator on the card).
- Add a "test open" button that fires the link immediately so users can verify it works before the scheduled time.
- Conflict warning when two active meetings overlap on the same day and time.
- Referral or invite flow to drive word-of-mouth growth.
- Zapier or webhook integration for power users who want to trigger other actions when a meeting opens.
- Some meetings are scheduled for the first weekday of every month, make an option for that. not sure what it would be called. also needs to work for auto detect/import


## School Features
- Landing page specifically for schools (schools.linkjoin.xyz or similar)
- Student-specific analytics: whether the student actually joined, when they joined, and how late they were.
  - Should track opened on time, opened late, missed launch, student clicked manually, reminder sent, reminder acknowledged, computer asleep/offline, repeated tardy pattern
- Administrator dashboard at each level: teachers can view/manage students, school administrators can view/manage teachers and see aggregate student info, district administrators can see school metrics. Each level should be able to break down into the individual levels as well.
  - Should track tardy patterns by student, class, teacher, grade, school, day of week, and intervention status.
  - Real-time attendance data: LinkJoin can tell teachers which students joined and when.
- Family engagement: parents should be able to receive text reminders and email updates about their children's classes
- Security: FERPA/COPPA posture, security documentation, data retention/deletion policy, subprocessors, SSO support, admin controls, audit logs, and accessibility compliance.
- Importing links: schedules should be taken fsrom Google Calendar, Canvas, Schoology, Google Classroom, Clever/ClassLink, or OneRoster files.
- Could add optional rewards for on-time streaks, badges or something similar.
- LMS integration: integration with systems like Google Classroom, Canvas, Schoology, PowerSchool, Infinite Campus, Clever/ClassLink, Google Workspace for Education (Admin SDK for automatic rostering), or at minimum OneRoster-compatible roster and schedule import.
- Intervention workflows: automatic flags based on attendance, counselor/admin follow-up, parent outreach history, notes, escalation rules.
- Academic calendar / blackout dates: administrators should be able to mark non-school days (holidays, snow days, professional development days) so that meetings scheduled on those days are suppressed and not logged as missed.
- Attendance export: student join data (on time, late, missed) should be exportable in formats compatible with SIS platforms like PowerSchool and Infinite Campus so schools don't have to manually reconcile LinkJoin data with their official attendance records.
- implementation/admin setup: bulk rostering, managed Chromebook deployment, role-based permissions.