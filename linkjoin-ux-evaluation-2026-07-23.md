# LinkJoin UX/UI Evaluation

**Date:** 2026-07-23 · **Branch:** `dev` @ `f78f5fe` · **Method:** static analysis + production browser audit + computed color/contrast validation

Report only. No product code was changed.

---

## Coverage and its limits

| Section | Method | Confidence |
|---|---|---|
| 1. Public + auth | Production browser, 4 viewports, computed contrast + focus audits | High |
| 2. Core app | **Live** against seeded `linkjoin_test`, as teacher + school_admin | High |
| 3. Schools admin | **Live** (teacher view; school_admin blocked at the 2FA gate) | High |
| 4. Extension | **Live** (popup + premeet rendered via a `chrome.*` shim) | High |

Sections 2 and 3 were audited live after seeding `linkjoin_test` (Lincoln High School: 1 school_admin, 3 teachers, 8 students, 7 classes) and running the backend against it. This turned several source-level inferences into runtime-confirmed findings and surfaced five defects that source analysis could not reach (F5 severity, F20 to F23).

Section 4 was rendered live by running the extension's own `popup.js` and `premeet.js` unmodified behind a small shim for the `chrome.*` storage/runtime/tabs APIs and `fetch`, with seeded meeting data. This renders the true free-tier dashboard, the premium dashboard, and the pre-meeting countdown, and lets the same focus and contrast audits run against them.

One coverage gap remains:
- **The school_admin role could not be fully exercised.** Admin accounts are gated behind a 2FA requirement that needs a real phone number, so `OrgAttendanceTab`, `LeakSignalTab`, `AuditLogTab`, and the district view were not rendered. The teacher view of `AdminDashboard` was.

---

## Scorecard

1 = broken, 3 = acceptable, 5 = excellent. Bold = evidence-backed weakest link.

| Dimension | S1 Public | S2 App | S3 Schools | S4 Ext |
|---|:--:|:--:|:--:|:--:|
| 1. First impression / value clarity | 4 | 3 | **2** | n/a |
| 2. Hierarchy & visual rhythm | 3 | 3 | **2** | 3 |
| 3. Consistency & system integrity | 2 | 2 | 2 | 2 |
| 4. Accessibility (WCAG 2.2 AA) | 2 | **1** | **1** | 3 |
| 5. Interaction & feedback | 3 | **2** | 3 | 3 |
| 6. Responsive / cross-device | 4 | 4 | 4 | n/a |
| 7. Perceived performance & motion | 3 | 4 | 4 | 3 |

Section 4 scores held after the live render: accessibility stays the product's best at 3, because the extension is the one surface that gets keyboard focus right (0 of 3 controls bare). It still shares the CTA-contrast and motion defects, so it does not score higher.

Live access moved four scores. **Accessibility in the core app dropped from 2 to 1** on the modal evidence in F5. **Schools first-impression and hierarchy dropped to 2** on F21: the teacher's primary dashboard is 73% empty with no summary state. Responsive and performance scored well once measurable (no overflow at 390/768/1440, no slow interactions).

**Product-wide: accessibility is the weakest dimension by a wide margin, and design-system integrity is the second.** Neither is a taste problem; both are measurable and both have concentrated, cheap fixes.

### The four things to fix first

1. **F2 — the primary CTA color fails AA.** One hex, every button in the product.
2. **F3 — buttons have no focus indicator.** Three lines of CSS. Worst inside the app: `/settings` is 67% keyboard-invisible.
3. **F5 — modals leak focus to the page behind them.** Runtime-confirmed: 12 of 13 controls reachable behind an open dialog. The fix is importing a trap that is already written and unused.
4. **F4 — admin tables are not keyboard-operable and expose no sort state.** The district-facing compliance surface.

Together these are roughly a day of work and they move accessibility from the product's weakest dimension to a passing one.

---

## P0

### F1. `seed_school.py` and `seed_parents.py` write to the production database
- `linkjoin-backend/seed_school.py:112` — `db = client["zoom_opener"]`
- `linkjoin-backend/seed_parents.py:65` — `db = client.zoom_opener`

Both hardcode the production database name and ignore `MONGO_DATABASE`. `seed_attendance.py:82` does it correctly (`client[db_name]`).

`seed_school.py` supports `--wipe`, documented as "removes all Lincoln High School data before re-seeding." Run from a normal checkout, `python seed_school.py --wipe` deletes from and then writes 12 accounts into production. The `.env` beside it holds live Atlas, Stripe, Twilio, and Google credentials.

**Not a UX finding**, but it blocked this audit and it is the highest-severity thing found. **Fix:** read `MONGO_DATABASE` with a fail-closed default, matching `tests_pytest/conftest.py`.

**Failure scenario:** a new engineer follows the docstring's stated usage and destroys production school data.

---

### F2. Primary CTA color fails WCAG AA for normal text — product-wide
`#2B8FD8` + white text = **3.49:1**. AA requires 4.5:1 below 18.66px. Verified by hand and by script.

Measured failures: "Get started" (nav, 15px, 3.49), "Get started" (plan CTA, 16px, 3.49), "Start free trial" (16px, 3.49), "Log In" (`ap-submit`, 15px, 3.49).

This is `--lightblue` / `--nh-accent` / `--sc-accent`, so it is every primary button on every surface, plus the extension.

**Fix:** darken to **`#2477B5`** (4.79:1), the nearest brand-faithful passing blue. Candidates computed:

| hex | ratio | |
|---|---|---|
| `#2B8FD8` (current) | 3.49 | fail |
| **`#2477B5`** | **4.79** | **pass, closest to brand** |
| `#2563EB` | 5.17 | pass (already the light-theme `--lightblue` in `globals.css:20`) |
| `#1E6FA8` | 5.39 | pass |

Large/bold text at ≥18.66px only needs 3:1, so hero-scale type can keep the current blue.

**Worst instance, confirmed live in the extension:** premeet's "Join now" button is white on `#2B8FD8` (3.49:1) and it is the single most time-critical control in the product. The pre-meeting card counts down from 5 seconds; a user has that long to read the meeting name and hit Join. The popup's active "Dashboard" button has the same 3.49:1.

---

### F3. `<button>` has no focus indicator anywhere
`globals.css:52-54` removes the default outline; **`:focus-visible` appears 0 times in the codebase.**

Measured across 5 production pages with transitions disabled. **Every failing element was a `<button>`; zero inputs and zero links failed** — inputs got custom focus styles in newer stylesheets, links keep the UA default.

| Page | no visible focus | total | | |
|---|---|---|---|---|
| `/settings` | 18 | 27 | **67%** | authenticated |
| `/login` | 4 | 8 | 50% | public |
| `/admin` | 7 | 14 | **50%** | authenticated |
| `/meetings` | 5 | 13 | 38% | authenticated |
| `/` | 11 | 34 | 32% | public |
| `/pricing` | 7 | 30 | 23% | public |
| `/extension` | 5 | 32 | 16% | public |
| `/schools` | 2 | 24 | 8% | public |

**The authenticated app is worse than the marketing site**, which inverts the usual priority: these are the screens people use every day.

Affected: on `/admin`, **all four tab buttons** (Classes, Open Log, Interventions, Audit Log), so the dashboard's primary navigation is entirely keyboard-invisible. On `/settings`, every "Save" button and "Change photo". Publicly: "Log In" submit, "Continue with Google", "Get started for free", "Start free trial", and the Product/Resources nav triggers.

One correction to the public-only finding: on `/settings` a `<select>` (country code) also fails, so this is not strictly buttons-only once you are inside the app.

**Failure scenario:** a keyboard user tabs to "Log In" and nothing changes on screen. They cannot tell what is selected before pressing Enter.

**Fix:** replace the blanket removal with a `:focus-visible` ring. Roughly three lines, fixes all 384 buttons at once.

```css
button:focus { outline: none }                 /* keep: kills mouse-click rings */
button:focus-visible {                          /* add */
  outline: 2px solid var(--lightblue);
  outline-offset: 2px;
}
```

---

### F4. Admin tables are not keyboard-sortable and expose no sort state
`AdminDashboard.jsx:3096-3097` and `:3240-3241`:

```jsx
<th style={{ cursor: 'pointer', ... }} onClick={() => toggleSort(col.key)}>
```

No `tabIndex`, no `onKeyDown`, no `role="button"`. **`aria-sort` appears 0 times app-wide.** Sort direction is conveyed by bare `↑`/`↓`/`↕` glyphs with no text alternative.

Also across all schools tables (`AdminDashboard` 9 tables, `SchoolAttendance`, `NewAttendance`, `ParentPortal`): **0 `scope=` attributes, 0 `<caption>`** on 50 `<th>`. Without `scope`, screen readers cannot reliably associate cells with headers in two-axis tables.

**Failure scenario:** an administrator using a keyboard or screen reader cannot sort by attendance rate, the primary triage action on the page. WCAG 2.1.1, 1.3.1, 4.1.2.

---

### F5. Modals leak keyboard focus to the page behind them
**Upgraded from P1 to P0 on runtime evidence.**

Tested live on the "What's new" modal at `/meetings`:

```
role=NONE   aria-modal=NONE   aria-labelledby=NONE
focus on open        -> BODY   (never enters the dialog)
Escape               -> STILL OPEN
focusable total 13 | inside modal 1 | REACHABLE BEHIND MODAL 12
   behind: "Add to Chrome", "✕", "Add meeting", "Search meetings…", …
```

`hooks/useFocusTrap.js` is a complete, correct focus trap with **zero importers**. `useModalClose` (11 adopters) is not a substitute: it only sets a `closing` flag and calls `onClose` after 160ms, handling neither focus nor Escape. Not adopting even that: `AuthModal`, `CalendarImportModal`, `TeacherSetupModal`.

Compounding it, the modal's only control ("Got it") is itself one of the focus-less buttons from F3.

**Failure scenario:** a keyboard or screen reader user hits a modal, is never moved into it, cannot dismiss it with Escape, and tabs through 12 controls on the page underneath — including "Add meeting" — while a dialog they cannot perceive is open.

**Fix:** wire the existing trap into a shared modal shell, add `role="dialog"` + `aria-modal="true"` + `aria-labelledby`, and bind Escape. The hard part is already written.

---

## P1

### F5b. Modal semantics, source-level detail
13 `*Modal.jsx` components. Sampled `LinkModal`, `DeleteModal`, `ShareModal`, `SettingsModal`:

- `role="dialog"`: **0**
- `aria-modal`: **0**
- `aria-labelledby` / `aria-label`: **0**
- Escape handling: **1 of 4** (`ShareModal` only)

`hooks/useFocusTrap.js` is a complete, correct focus trap with **0 importers**. It is dead code.

`useModalClose` (11 adopters) is not a substitute: it only sets a `closing` flag and calls `onClose` after 160ms. It handles neither focus nor Escape.

Not adopting even that: `AuthModal`, `CalendarImportModal`, `TeacherSetupModal`.

**Failure scenario:** a screen reader user opens the delete-confirmation modal. It is not announced as a dialog, focus stays behind it, they can Tab into the page underneath and confirm a deletion they cannot see.

**Fix:** wire the existing `useFocusTrap` into a shared modal shell and add `role="dialog"` + `aria-modal="true"` + `aria-labelledby`. The hard part is already written.

---

### F6. Widespread text contrast failures
Measured on rendered production pages against effective (ancestor-resolved) backgrounds:

| Page | failures | |
|---|---|---|
| `/` | **35** | public |
| `schools.linkjoin.xyz` | 22 | public |
| `/settings` | 16 | authenticated |
| `/pricing` | 14 | public |
| `/admin` | 6 | authenticated |
| `/login` | 6 | public |

In the app, the failures land on structural labels rather than fine print: "Personal Settings", "Profile", "Preferences" (`settings-group-label` / `settings-section-title`, 10-11px) all measure **3.17:1**, and the `/admin` tab labels measure 3.80:1. These are the page's own signposts.

Worst offenders:

| Text | size | ratio | needs |
|---|---|---|---|
| "Your meetings, handled." (`a2-caption`) | 11px | **1.69** | 4.5 |
| "and more..." (`nh-platform-pill`) | 12px | **1.68** | 4.5 |
| Nav dropdown subtitles (`nh-nav-menu-sub`) ×6 | 11px | 2.44 | 4.5 |
| Platform pills: Zoom / Meet / Teams / Webex | 12px | 2.44 | 4.5 |
| Schools hierarchy subtitles (`sc-hier-sub`) | 14px | 2.30 | 4.5 |
| Schools table headers (Student/Joined/Status) | 10px | 2.54 | 4.5 |
| `© 2026 LinkJoin` | 12px | 2.44 | 4.5 |

The nav dropdown subtitles fail identically on all five pages, so this is one shared component, not seven separate bugs.

---

### F7. Status color encoding fails CVD validation
`AdminDashboard.jsx:240` and `:1439`:

```jsx
background: pct >= 80 ? '#48c578' : pct >= 50 ? '#f0c040' : '#ff6b6b'
```

Run through the dataviz validator:

```
[FAIL] Lightness band     #f0c040 at 0.829, outside band
[WARN] CVD separation     #f0c040 <-> #48c578  ΔE 7.2 (protan)
[WARN] Contrast vs surface  all three below 3:1 (2.15, 1.66, 2.70)
→ FAILED
```

ΔE 7.2 sits in the 6-8 floor band, which is permissible **only with secondary encoding**. Precisely, by instance:

- **`:1439` (attendance table) is acceptable** — `att-rate-label` renders `sessions/expected` beside the bar, so color is redundant.
- **`:240` (student-profile class list) is not** — bar only, no rate label. The good/warning/critical threshold is carried by hue alone.
- **`:1444` (tardy count) is not** — the number is shown, but the severity split (`#ff6b6b` vs `#f0c040`) is hue alone.

All three bypass every token system with inline hexes.

**Fix:** adopt the validated status steps (`good #0ca30c`, `warning #fab219`, `critical #d03b3b`) and pair every status with an icon or label. Per the dataviz reference: a status color never carries meaning alone.

---

### F19. Incident banner is CORS-blocked on the schools subdomain
Live console, isolated by comparison:

```
schools.linkjoin.xyz → Access to fetch at
'https://linkjoin.azurewebsites.net/incidents/active'
from origin 'https://schools.linkjoin.xyz' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present.

linkjoin.xyz → (no console errors)
```

The backend CORS allowlist covers the apex domain but not `schools.linkjoin.xyz`. `IncidentBanner` is mounted globally in `App.jsx:120`, so it renders on the schools subdomain but its fetch always fails silently.

**Failure scenario:** during an outage, school and district administrators are the only users who never see the incident banner. They are also the only customers with an SLA (`/sla` exists as a published page).

**Fix:** add the schools subdomain to the backend CORS origin allowlist.

---

### F8. No reduced-motion support
0 `prefers-reduced-motion` rules across 21,387 lines of CSS, confirmed at runtime (0 matching media rules in the live stylesheet).

The homepage runs **80 animated elements** and gates all below-fold content behind `nh-reveal` (22 elements at `opacity: 0`, revealed by IntersectionObserver). A user with vestibular sensitivity gets the full animation with no way to opt out. WCAG 2.3.3.

Side effect: a full-page screenshot renders the entire page below the stats bar as empty bands, which also affects archival and any preview rendering.

---

### F20. Fixed banners overlap the sidebar logo
The MFA banner is `position: fixed` at `y=0, height=42`. The sidebar logo is `position: static` at `y=18, height=30`. The banner covers 24 of the logo's 30px. Nothing offsets page content by the banner's height.

Applies to every globally-mounted banner in `App.jsx:120` (`MfaSetupBanner`, `TrialEndingBanner`, `IncidentBanner`), so it fires for trials and incidents too, not just 2FA.

**Fix:** offset the app shell by the banner height, or make the banner `sticky` in flow rather than `fixed`.

---

### F21. The teacher dashboard has no summary state
`/admin` as a teacher: content ends at `y=240` in a 900px viewport. **660px empty, 73% of the viewport.** Three class cards in one row, then nothing.

There is no at-a-glance state: no attendance summary, no "needs follow-up" count, no today's-sessions strip. A teacher opening their primary screen cannot tell whether anything requires attention without clicking into each class. The interventions system exists (`OrgInterventionList`, `IvDetailPanel`) but surfaces nothing on the landing view.

This is the schools product's core daily surface, and it scores lowest on first-impression for that reason.

---

### F22. Pluralization bug on the teacher dashboard
`AdminDashboard.jsx:2740`:

```jsx
<div className="class-card-stat"><span>{(cls.link_ids || []).length}</span> links</div>
```

Renders "**1 links**" on every single-link class. Visible on the teacher's main screen for all three seeded classes.

---

### F23. First run stacks two interruptions
A brand-new teacher's first view of `/meetings` shows the extension install banner **and** the "What's new" modal simultaneously, before they have seen the product.

"What's new" is a changelog. Showing it to an account with no prior version to contrast against is a misfire: the five items it lists read as feature discovery, not news, and it is the first thing the user must dismiss.

**Fix:** suppress `WhatsNewModal` for accounts created after the release it describes, and stagger the extension prompt to a later session.

---

## P2

### F9. Three (four) parallel token systems
| Concept | `:root` | `--nh-*` | `--sc-*` | extension |
|---|---|---|---|---|
| accent | `--lightblue: #2B8FD8` | `--nh-accent: #2B8FD8` | `--sc-accent: #2B8FD8` | `--lightblue: #2B8FD8` |
| radius | none | `14px` | `12px` | none |
| nav height | none | `68px` | `68px` | none |
| max width | none | `1200px` | `1160px` | none |

The same accent is defined four times. Radius and max-width differ with no stated reason. 190 distinct hex literals overall; `#2B8FD8` and `#2b8fd8` both appear (93 + 32 uses). The extension reuses the same *names* (`--blue`, `--border`, `--muted`) with its own values.

### F10. No spacing or type scale
- **60** distinct px values in padding/margin/gap, including 3, 5, 7, 9, 11, 15, 18, 22px.
- **46** distinct font-size values, including `13.5px`.
- **15** distinct border-radius values (2px to 20px, plus 50% and 100px); neither `--nh-radius` (14px) nor `--sc-radius` (12px) matches the actually-dominant 8px/10px.
- No spacing or type tokens exist in any namespace.

The top six spacing values (8, 10, 12, 20, 16, 14) already dominate usage, so a 4px scale is latent and mostly just needs naming.

### F11. Dark mode is not a mode
`useDarkMode.js` `getPreferred()` hard-returns `true`. The light token block at `globals.css:17-28` is unreachable. `toggle()` is still exported and still writes `lj_theme`, but nothing can call it. 0 `prefers-color-scheme` queries.

### F12. Dead files (7)
`components/Footer.jsx`, `components/Header.jsx`, `components/PublicHeader.jsx`, `components/StudentProfileModal.jsx`, `pages/AuthPage.jsx`, `pages/Profile.jsx`, `hooks/useFocusTrap.js`.

Live headers are `HeaderModern` (6 pages), `NhNav` (12), `SideNav` (8). `AuthPage2` supersedes `AuthPage`; `StudentProfile` is routed at `/profile` while `Profile.jsx` is orphaned. Also confirm which of `links.css` (722 lines) and `new_links.css` (741) is live.

### F13. Non-semantic interactive elements
73 `<div>`/`<span>` with `onClick` (not focusable, no role, no key handler). 22 `<input>` with neither `id` nor `aria-label`. 70 `<svg>` without `aria-hidden`. **1** `aria-live` region product-wide despite heavy async (attendance saves, roster imports).

`<main>` appears only on 5 static legal pages, never on an app screen. No skip link anywhere.

Credit where due: `SideNav` labels its icon-only buttons correctly (`aria-label="Open menu"`, `"Dismiss"`, `"Add meeting"`).

### F14. Async state coverage is thin
Skeletons exist in exactly **1** file (`Links.jsx`). Gaps: `Notes.jsx` has loading + empty but **no error state**; `StudentProfile.jsx` has loading only; `AddLink.jsx` has loading only.

Not a finding: `History.jsx` reads as 0/0/0 but delegates to `HistoryPanel.jsx`, which handles states.

### F15. Login decorative card stack reads as broken
`/login`, right panel. Three rotated cards at y=167/267/372 with heights 225/264/295 overlap by 125-159px while their text sits inside the occluded zone. Backgrounds are opaque with correct z-order (1/2/3), so it is not a transparency bug — the fan geometry simply cuts through the type. Renders as garbled overlapping text. See `prod-login-focus.png`.

### F16. Schools subdomain is not differentiated
`schools.linkjoin.xyz` serves `<title>LinkJoin: Meetings that open themselves` — the consumer title. `App.jsx:127-135` deliberately serves this subdomain so it "reads as a dedicated site when shared with administrators," but it inherits the consumer nav (Product / Resources) and the consumer title.

The fold is type-only: no product screenshot, and no trust signals despite DPA, SLA, Subprocessors, and BreachPolicy pages existing. For K-12 procurement, compliance badges and a dashboard screenshot are the two highest-value additions.

### F17. Pricing copy contradicts the tier table
Individual ($0) reads "Full access to every feature, forever. No catch." Premium then lists 7 features Individual does not get. The claim undercuts the upgrade and reads as a trust problem.

### F18. Admin density has no system
`admin.css` is the densest surface and its dominant sizes are 13px (35 uses), 11px (30), 12px (29). Table cell padding uses seven different pairs (`8px 12px`, `14px 16px`, `2px 6px`, `9px 12px`, `7px 12px`, `7px 10px`, `8px 16px`). Combined with F6's 10-11px contrast failures, this is the surface administrators read all day.

---

### F24. Extension shares the CTA-contrast and motion defects (but not the focus one)
Rendered live via the extension's own code. Findings that carry into the extension:

- **F2** — "Join now" (premeet) and "Dashboard" (popup active) are both white on `#2B8FD8`, 3.49:1. See F2 for the premeet stakes.
- **F6** — popup meeting times (`meeting-next`, 11px) measure 4.45:1; premeet "is starting soon" measures 3.17:1.
- **F8** — 0 `prefers-reduced-motion`; the popup has 17 transitions and premeet runs a continuous countdown ring.
- **F9** — the extension is a fourth token namespace (`--blue`, `--border`, `--muted`), reusing app concept names with its own values.

What the extension does **right**, and better than the app: **keyboard focus.** The popup scored 0 of 3 bare in the focus audit; `popup.css` gives inputs and buttons real focus styles. It is the only surface where F3 does not apply. The free-tier locked scan button is also handled well: dimmed to 0.45 opacity with a `not-allowed` cursor and a tooltip, so the lock is visible, not silent.

---

## What is working

Worth protecting during any fix pass.

- **Homepage value proposition.** "Meetings that open themselves." is specific and benefit-led, with clean primary/secondary CTA hierarchy.
- **Performance.** 549ms full load on production, clean console, no failed requests.
- **Responsive.** No horizontal overflow at 375, 768, or 1440. Mobile correctly swaps "Add to Chrome" for "Sign up with Google" rather than showing a desktop-only action.
- **Pricing layout.** Three tiers, aligned CTAs despite unequal feature counts, clear trial badge.
- **Semantic tables.** The schools surfaces use real `<table>`/`<th>`, not div grids. `scope` and `aria-sort` are additive fixes, not a rewrite.
- **Inputs already have focus styles.** `AuthPage2` inputs get a blue border plus a 3px glow. F3's fix is extending an existing pattern to buttons, not inventing one.

---

## Recommended fix sequence

**Wave 1 — one-line, product-wide.** F1 (seed scripts, do this first regardless), F2 (`#2B8FD8` → `#2477B5`), F3 (`:focus-visible`), F8 (`prefers-reduced-motion`). Four small changes, four systemic defects.

**Wave 2 — schools compliance.** F4 (`scope`, `aria-sort`, keyboard sort), F7 (status encoding), F6 on the schools surfaces. This is the procurement-facing risk.

**Wave 3 — app semantics.** F5 (wire up the focus trap that already exists), F13 (`<main>`, skip link, `aria-live`), F14 (error states).

**Wave 4 — system consolidation.** F9/F10 (unify tokens, name the latent 4px scale), F11, F12. Highest effort, lowest user-visible urgency, but it is what stops the other four waves from regressing.

---

## Verification

Re-run before closing any item:

```bash
# Focus coverage (expects 0 bare buttons after F3)
$B goto https://linkjoin.xyz/login && $B eval scratchpad/focus-audit.js

# Contrast (expects 0 failures after F2/F6)
$B goto https://linkjoin.xyz && $B eval scratchpad/contrast-audit.js

# Status palette (expects PASS after F7)
node dataviz/scripts/validate_palette.js "#0ca30c,#fab219,#d03b3b" --mode dark
```

Both audit scripts disable CSS transitions before sampling. Without that, a focus ring mid-transition reads as absent — that produced a false positive during this audit before it was corrected.

**Sections 2 to 4 still need a live pass** against a seeded `linkjoin_test` database, at 768px and 1440px, per role (teacher, school_admin, district_admin, parent, student).
