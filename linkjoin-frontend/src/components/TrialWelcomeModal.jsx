import { useModalClose } from '../hooks/useModalClose.js'
import { usersApi } from '../api/users.js'
import { trialDaysRemaining } from '../utils.js'
import '../styles/modal.css'

const TRIAL_FEATURES = [
  'Calendar import (Google & Outlook)',
  'AI email meeting detection',
  'Auto-delete past meetings',
  'Vacation mode',
  'Open early',
  'Attendance history & streaks',
]

export default function TrialWelcomeModal({ trialEnd, existingAccount = false, onClose }) {
  const { closing, handleClose, overlayRef, dialogProps } = useModalClose(onClose)
  const days = trialDaysRemaining(trialEnd) || 14

  function dismiss() {
    usersApi.markTrialWelcomeSeen().catch(() => {})
    handleClose()
  }

  return (
    <div className={`modal-overlay sn-page-overlay${closing ? ' closing' : ''}`} onClick={dismiss}>
      <div className="modal-card whats-new-card upgrade-modal-card" ref={overlayRef} {...dialogProps} aria-labelledby="trial-welcome-title" onClick={e => e.stopPropagation()}>
        <div className="upgrade-modal-icon">
          <img src="/images/crown.svg" alt="" width="22" height="22" />
        </div>
        <div className="whats-new-header">
          <div className="upgrade-modal-eyebrow">
            {existingAccount ? 'A gift for being here early' : 'Welcome to LinkJoin'}
          </div>
          <div className="modal-title" id="trial-welcome-title" style={{ margin: 0, paddingLeft: 0 }}>
            Your {days}-day free trial has started
          </div>
        </div>

        <p className="whats-new-desc" style={{ padding: '0 4px 8px' }}>
          {existingAccount
            ? `Thanks for using LinkJoin. We've added Premium features since you signed up, so here's ${days} days to try all of them, no card required:`
            : `You have full access to every Premium feature for the next ${days} days, no card required. Here's what's included:`}
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
