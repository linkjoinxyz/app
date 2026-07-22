import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
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
  const today = new Date().toISOString().slice(0, 10)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === today
    } catch {
      return false
    }
  })

  if (premiumStatus !== 'trial') return null
  if (trialDaysLeft === null || trialDaysLeft > WARN_WITHIN_DAYS) return null
  if (dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, today)
    } catch {}
    setDismissed(true)
  }

  const when =
    trialDaysLeft === 0 ? 'today'
      : trialDaysLeft === 1 ? 'tomorrow'
        : `in ${trialDaysLeft} days`

  return (
    <div className="trial-banner" role="status">
      <span className="trial-banner-text">
        <strong>Your free trial ends {when}.</strong>{' '}
        Keep calendar import, email meeting detection, auto-delete and vacation mode.
      </span>
      <button className="trial-banner-btn" onClick={() => navigate('/pricing')}>
        See plans
      </button>
      <button className="trial-banner-dismiss" onClick={dismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  )
}
