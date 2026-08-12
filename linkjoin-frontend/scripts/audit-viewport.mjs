#!/usr/bin/env node
// Fails if any public route renders content outside the viewport on mobile.
//
// Two distinct failures are reported:
//   hscroll  - the document itself scrolls sideways (always a bug)
//   cutOff   - content clipped by an overflow:hidden/clip ancestor, so the
//              user can neither see it nor scroll to it (also a bug)
// Content inside a real overflow:auto/scroll container is reachable and
// therefore fine. Purely decorative bleed (no text) under a clipping
// ancestor is intentional design and is ignored.
//
// Usage: node scripts/audit-viewport.mjs [baseUrl]
//   npm run dev &   # or point at prod
//   node scripts/audit-viewport.mjs http://localhost:5173

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5173';
// 393 = iPhone 15, the width this suite originally missed.
const WIDTHS = [320, 393, 430];
// Rows inside position:fixed/sticky can't be scrolled away, so on iOS they pan
// the whole page. Safari renders text slightly wider than headless Chromium, so
// anything this close to the edge here is already broken on a real iPhone.
const MIN_SLACK = 8;
const ROUTES = [
  '/', '/old-homepage', '/login', '/signup', '/pricing', '/extension',
  '/privacy', '/tos', '/forgot-password', '/contact', '/status', '/api-docs',
  '/sla', '/dpa', '/privacy-schools', '/subprocessors', '/breach-policy',
  '/schools', '/schools/attendance', '/schools/dashboards', '/demo', '/premeet',
];

// Behind PrivateRoute. Only audited when QA_EMAIL / QA_PASSWORD are set, since
// they need a throwaway account on a throwaway backend -- never a prod login.
// See scripts/qa-env.md for standing that up.
const AUTHED_ROUTES = ['/meetings', '/bookmarks', '/notes', '/settings', '/history'];
const { QA_EMAIL, QA_PASSWORD } = process.env;

// Role-gated pages redirect away unless the account holds the role, so each set
// needs its own login. Populated by seed_school.py / seed_parents.py (all
// Test1234!) plus a platform admin flagged by hand -- see scripts/qa-env.md.
// Enabled with QA_ROLES=1; skipped otherwise since it needs the seeded org.
const ROLE_SUITES = [
  { role: 'student',  email: 'emma.wilson@student.lincoln.edu', pass: 'Test1234!',       routes: ['/profile'] },
  { role: 'parent',   email: 'david.wilson@gmail.com',          pass: 'Test1234!',       routes: ['/parent'] },
  { role: 'teacher',  email: 'ms.chen@lincoln.edu',             pass: 'Test1234!',       routes: ['/admin'] },
  { role: 'schooladmin', email: 'admin@lincoln.edu',            pass: 'Test1234!',       routes: ['/admin', '/onboarding'] },
  { role: 'platform', email: 'qa.platform@example.com',         pass: 'QaViewport!2026', routes: ['/platform', '/platform/orgs/new'] },
];

const BROWSE = join(homedir(), '.claude/skills/gstack/browse/dist/browse');
if (!existsSync(BROWSE)) {
  console.error(`gstack browse not found at ${BROWSE} — run the /browse skill setup first.`);
  process.exit(2);
}
const browse = (...args) =>
  execFileSync(BROWSE, args, { encoding: 'utf8', maxBuffer: 32 << 20 });

// Runs in the page. Kept as a string so it can go straight to `browse js`.
const PROBE = `(() => {
  const de = document.documentElement, vw = de.clientWidth;
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const clipper = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return 'scroller';
      if (ox === 'hidden' || ox === 'clip') return 'clipped';
    }
    return null;
  };
  const pinned = el => {
    for (let p = el; p; p = p.parentElement) {
      const ps = getComputedStyle(p).position;
      if (ps === 'fixed' || ps === 'sticky') return true;
    }
    return false;
  };
  const cutOff = [];
  let tight = null;
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const right = r.right + window.scrollX;

    // near-miss tracking: pinned rows that stop just short of the edge
    if (right <= vw + 1 && r.width > 0 && r.width < vw && pinned(el)) {
      const slack = vw - right;
      if (slack < ${MIN_SLACK} && (!tight || slack < tight.slack)) {
        tight = { sel: name(el), slack: Math.round(slack) };
      }
    }

    if (right <= vw + 1) return;
    const c = clipper(el);
    if (c === 'scroller') return;                        // reachable by scrolling
    if (c === 'clipped' && !(el.textContent || '').trim()) return;  // decorative bleed
    cutOff.push({ sel: name(el), right: Math.round(right), w: Math.round(r.width) });
  });
  return JSON.stringify({ vw, hscroll: de.scrollWidth > vw + 1, docW: de.scrollWidth, cutOff: cutOff.slice(0, 8), tight });
})()`;

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function login(email, password) {
  // Clear first: role suites run back to back and would otherwise keep the
  // previous session, silently auditing the wrong role's pages.
  browse('goto', `${BASE}/login`);
  sleep(1000);
  browse('js', 'localStorage.clear();sessionStorage.clear();1');
  browse('goto', `${BASE}/login`);
  sleep(2500);
  browse('fill', 'input[type="email"]', email);
  browse('fill', 'input[type="password"]', password);
  browse('click', '.ap-submit');
  sleep(4000);
  return !browse('url').includes('/login');
}

let routes = ROUTES;
if (QA_EMAIL && QA_PASSWORD) {
  browse('viewport', '393x852');
  if (login(QA_EMAIL, QA_PASSWORD)) {
    routes = [...ROUTES, ...AUTHED_ROUTES];
    console.log(`logged in as ${QA_EMAIL}; including ${AUTHED_ROUTES.length} authed routes\n`);
  } else {
    console.error('login failed — auditing public routes only');
  }
}

let failures = 0;
let warnings = 0;

function check(route, w, label = '') {
    browse('goto', `${BASE}${route}`);
    sleep(1600); // let reveal animations and fonts settle
    const landed = browse('url').trim().replace(BASE, '');
    const r = JSON.parse(browse('js', PROBE).trim());
    const tag = label ? `${label} ` : '';
    // A redirect means the guard bounced us; auditing the fallback page would
    // report a pass for a route that was never rendered.
    if (!landed.startsWith(route)) {
      console.log(`skip ${tag}${route} @${w}px — redirected to ${landed}`);
      return;
    }
    const bad = r.hscroll || r.cutOff.length > 0;
    if (bad) {
      failures++;
      console.log(`FAIL ${tag}${route} @${w}px` +
        (r.hscroll ? ` — document scrolls horizontally (${r.docW}px > ${w}px)` : '') +
        (r.cutOff.length ? ` — ${r.cutOff.length} element(s) cut off` : ''));
      for (const o of r.cutOff) console.log(`       ${o.sel} right=${o.right} w=${o.w}`);
    } else if (r.tight) {
      warnings++;
      console.log(`WARN ${tag}${route} @${w}px — ${r.tight.sel} has only ${r.tight.slack}px slack ` +
        `in a fixed/sticky row; Safari renders wider and will overflow`);
    } else {
      console.log(`ok   ${tag}${route} @${w}px`);
    }
}

for (const w of WIDTHS) {
  browse('viewport', `${w}x844`);
  for (const route of routes) check(route, w);
}

// Role-gated pages: one login per role, all widths for that role before moving
// on (logging in is far slower than resizing).
if (process.env.QA_ROLES) {
  for (const suite of ROLE_SUITES) {
    console.log(`\n--- ${suite.role} ---`);
    if (!login(suite.email, suite.password ?? suite.pass)) {
      console.error(`FAIL ${suite.role}: login failed for ${suite.email}`);
      failures++;
      continue;
    }
    for (const w of WIDTHS) {
      browse('viewport', `${w}x844`);
      for (const route of suite.routes) check(route, w, `[${suite.role}]`);
    }
  }
}

console.log(failures
  ? `\n${failures} viewport failure(s), ${warnings} warning(s)`
  : `\nAll routes bounded to the viewport.${warnings ? ` ${warnings} near-miss warning(s).` : ''}`);
process.exit(failures ? 1 : 0);
