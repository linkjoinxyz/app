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