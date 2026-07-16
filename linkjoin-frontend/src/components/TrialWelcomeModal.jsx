import { useModalClose } from '../hooks/useModalClose.js'
import { usersApi } from '../api/users.js'
import '../styles/modal.css'

const TRIAL_FEATURES = [
  'Calendar import (Google & Outlook)',
  'AI email meeting detection',
  'Auto-delete past meetings',
  'Vacation mode',
  'Open early',
  'Attendance history & streaks',
]

function daysRemaining(trialEnd) {
  if (!trialEnd) return 14
  // Backend serializes Mongo-read datetimes without a timezone suffix (naive),
  // even though they're stored as UTC — force UTC interpretation here so this
  // doesn't drift by the user's UTC offset.
  const iso = /[zZ]|[+-]\d\d:\d\d$/.test(trialEnd) ? trialEnd : `${trialEnd}Z`
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export default function TrialWelcomeModal({ trialEnd, onClose }) {
  const { closing, handleClose } = useModalClose(onClose)
  const days = daysRemaining(trialEnd)

  function dismiss() {
    usersApi.markTrialWelcomeSeen().catch(() => {})
    handleClose()
  }

  return (
    <div className={`modal-overlay sn-page-overlay${closing ? ' closing' : ''}`} onClick={dismiss}>
      <div className="modal-card whats-new-card upgrade-modal-card" onClick={e => e.stopPropagation()}>
        <div className="upgrade-modal-icon">
          <img src="/images/crown.svg" alt="" width="22" height="22" />
        </div>
        <div className="whats-new-header">
          <div className="upgrade-modal-eyebrow">Welcome to LinkJoin</div>
          <div className="modal-title" style={{ margin: 0, paddingLeft: 0 }}>
            Your {days}-day free trial has started
          </div>
        </div>

        <p className="whats-new-desc" style={{ padding: '0 4px 8px' }}>
          You have full access to every Premium feature for the next {days} days, no card
          required. Here's what's included:
        </p>

        <ul className="whats-new-list trial-welcome-list">
          {TRIAL_FEATURES.map(f => (
            <li key={f} className="whats-new-item">
              <span className="trial-welcome-check" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div className="whats-new-text">
                <div className="whats-new-name">{f}</div>
              </div>
            </li>
          ))}
        </ul>

        <button className="modal-submit upgrade-modal-submit" onClick={dismiss}>Got it</button>
      </div>
    </div>
  )
}
