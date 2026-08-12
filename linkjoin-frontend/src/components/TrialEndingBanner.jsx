import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isAppRoute } from '../utils.js'
import '../styles/trial-banner.css'

// Only warn near the end. Earlier than this it is nagging, and the modal at the
// start of the trial already told them the length.
const WARN_WITHIN_DAYS = 3
const DISMISS_KEY = 'lj_trial_banner_dismissed'

/**
 * Without this, a trial simply stops: Premium features start 403ing, the
 * extension's scan button quietly re-locks, and nothing ever said it was coming.
 * That is especially bad right now because every pre-launch account starts its
 * trial on next sign-in, so they all expire within a couple of weeks of each
 * other.
 *
 * Dismissal is keyed by day, so it stays out of the way for the rest of a
 * session but comes back as the deadline gets closer.
 */
export default function TrialEndingBanner() {
  const { premiumStatus, trialDaysLeft } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const today = new Date().toISOString().slice(0, 10)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === today
    } catch {
      return false
    }
  })

  if (!isAppRoute(pathname)) return null  // in-app only, not public marketing pages
  if (premiumStatus !== 'trial') return null
  if (trialDaysLeft === null || trialDaysLeft > WARN_WITHIN_DAYS) return null
  if (dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, today)
    } catch {}
    setDismissed(true)
  }

  // trialDaysRemaining ceils, so any end still in the future is at least 1.
  // 0 therefore means the trial is already over -- it read "ends today" for as
  // long as the account stayed on premium_status 'trial', which is days or
  // weeks after the fact, not just on the last day.
  const ended = trialDaysLeft === 0
  const headline = ended
    ? 'Your free trial has ended.'
    : `Your free trial ends ${trialDaysLeft === 1 ? 'tomorrow' : `in ${trialDaysLeft} days`}.`

  return (
    <div className="trial-banner" role="status">
      <span className="trial-banner-text">
        <strong>{headline}</strong>{' '}
        {ended ? 'Upgrade to restore' : 'Keep'} calendar import, email meeting
        detection, auto-delete and vacation mode.
      </span>
      {/* Settings, not /pricing: the upgrade action lives in the Billing
          section, so /pricing was a marketing detour on the way to it. */}
      <button className="trial-banner-btn" onClick={() => navigate('/settings#billing')}>
        {ended ? 'Upgrade' : 'See plans'}
      </button>
      <button className="trial-banner-dismiss" onClick={dismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  )
}
