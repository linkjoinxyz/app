export function openSafeUrl(url) {
  try {
    const { protocol } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {}
}

export function safeRedirect(raw) {
  if (!raw) return '/meetings'
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/meetings'
}

// --- Server timestamps ---------------------------------------------------------
// Mongo hands the backend naive datetimes, so `.isoformat()` serializes them
// without a timezone suffix ("2026-07-21T14:00:00") even though the value is
// UTC. `new Date()` parses a suffix-less ISO string as LOCAL time, so rendering
// one directly shows the raw UTC clock number: a 9:00 AM Central class read back
// as "2:00 PM". Force the UTC reading, then format in the viewer's zone.
// Same fix AuthContext already applies to trial_end.

export function parseServerDate(value) {
  if (!value) return null
  let iso
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Date-only (record_date). `new Date('2026-07-21')` is UTC midnight per spec,
    // which renders as the PREVIOUS day west of Greenwich. Anchor at local noon
    // instead so the calendar date is what the server meant, in any zone. Same
    // trick the academic calendar card already uses.
    iso = `${value}T12:00:00`
  } else if (/[zZ]|[+-]\d\d:\d\d$/.test(value)) {
    iso = value // already carries an offset; trust it
  } else {
    iso = `${value}Z` // naive from Mongo, and Mongo stores UTC
  }
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

// --- "What's new" eligibility --------------------------------------------------
// The date the current What's New content shipped. An account created after this
// has never seen the product without these features, so there is nothing new to
// announce. Bump it whenever the WhatsNewModal contents change (alongside the
// whats_new_seen version in users.mark_whats_new_seen).
export const WHATS_NEW_RELEASED = '2026-07-01T00:00:00Z'

export function isReturningUser(user, releasedAt = WHATS_NEW_RELEASED) {
  if (!user) return false
  // No created_at means a legacy account that predates the field, so it is
  // definitely older than the release and should see what changed.
  if (!user.created_at) return true
  const created = parseServerDate(user.created_at)
  return created ? created < new Date(releasedAt) : true
}

// --- Trial helpers -------------------------------------------------------------

/** Whole days left on a trial, floored at 0. */
export function trialDaysRemaining(trialEnd, now = new Date()) {
  const end = parseServerDate(trialEnd)
  if (!end) return null
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
}

/**
 * Did this trial start on an account that already existed?
 *
 * A new signup gets its trial at registration, so trial_start and created_at are
 * the same moment. A pre-launch account gets one on its next login instead
 * (roles.ensure_trial_started), which is days-to-years after it was created —
 * and the oldest of them have no created_at at all, since the field postdates
 * them. Those people have been using LinkJoin for a while, so greeting them with
 * "Welcome to LinkJoin" reads as if we have forgotten them.
 */
export function isTrialForExistingAccount(user) {
  if (!user) return false
  if (!user.created_at) return true // predates the field, so certainly not new
  const created = parseServerDate(user.created_at)
  const started = parseServerDate(user.trial_start)
  if (!created || !started) return false
  return started.getTime() - created.getTime() > 86400000 // more than a day apart
}

// --- Timezone-change prompt ---------------------------------------------------
// When this device's IANA timezone differs from the saved one, Links.jsx offers to
// shift the user's link times. Declining used to be React state only, so the same
// prompt reappeared on every page load. The decline is stored per device (the
// mismatch is a property of this machine's clock) and keyed on the exact from/to
// pair, so travelling on to a third zone still asks.

const TZ_DECLINE_KEY = 'lj_tz_prompt_declined'

export function rememberTzPromptDeclined(from, to) {
  try {
    localStorage.setItem(TZ_DECLINE_KEY, JSON.stringify({ from, to }))
  } catch {}
}

export function isTzPromptDeclined(from, to) {
  try {
    const raw = localStorage.getItem(TZ_DECLINE_KEY)
    if (!raw) return false
    const saved = JSON.parse(raw)
    return saved?.from === from && saved?.to === to
  } catch {
    return false
  }
}

export function clearTzPromptDeclined() {
  try {
    localStorage.removeItem(TZ_DECLINE_KEY)
  } catch {}
}
