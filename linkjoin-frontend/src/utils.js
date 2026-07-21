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
