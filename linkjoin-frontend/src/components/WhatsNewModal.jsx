import { useModalClose } from '../hooks/useModalClose.js'
import { usersApi } from '../api/users.js'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/modal.css'

// `premium` is a flag rather than text baked into the name: school-plan accounts
// are entitled to all of it (roles.is_premium returns True for every
// institutional account), so labelling these "Premium" to a student or teacher
// advertised an upsell for something they already have.
const FEATURES = [
  {
    icon: '📅',
    name: 'Calendar view',
    desc: 'See all your meetings laid out by week. Toggle it on from the calendar icon in the header.',
  },
  {
    icon: '⬆️',
    name: 'Calendar import',
    premium: true,
    desc: 'Pull meetings directly from Google Calendar or Outlook instead of adding them one by one.',
  },
  {
    icon: '✉️',
    name: 'Email meeting detection',
    premium: true,
    desc: 'LinkJoin can scan your inbox and automatically find meeting links to import.',
  },
  {
    icon: '🗑️',
    name: 'Auto-delete old meetings',
    premium: true,
    desc: 'One-time meetings that have passed get cleaned up automatically. Turn it on in Settings.',
  },
  {
    icon: '🏖️',
    name: 'Vacation mode',
    premium: true,
    desc: 'Pause all automatic meeting opens while you\'re away. One toggle in Settings.',
  },
]

export default function WhatsNewModal({ onClose }) {
  const { closing, handleClose } = useModalClose(onClose)
  const { accountType } = useAuth()
  // Org members get everything with the school plan, so no upsell branding.
  const showPremiumBadge = accountType !== 'institutional'

  function dismiss() {
    usersApi.markWhatsNewSeen().catch(() => {})
    handleClose()
  }

  return (
    <div className={`modal-overlay sn-page-overlay${closing ? ' closing' : ''}`} onClick={dismiss}>
      <div className="modal-card whats-new-card" onClick={e => e.stopPropagation()}>
        <div className="whats-new-header">
          <div className="whats-new-eyebrow">New in LinkJoin</div>
          <div className="modal-title" style={{ margin: 0, paddingLeft: 0 }}>What's new</div>
        </div>

        <ul className="whats-new-list">
          {FEATURES.map(f => (
            <li key={f.name} className="whats-new-item">
              <span className="whats-new-icon">{f.icon}</span>
              <div className="whats-new-text">
                <div className="whats-new-name">
                  {f.name}
                  {f.premium && showPremiumBadge ? <span className="whats-new-premium"> (Premium)</span> : null}
                </div>
                <div className="whats-new-desc">{f.desc}</div>
              </div>
            </li>
          ))}
        </ul>

        <button className="modal-submit" onClick={dismiss}>Got it</button>
      </div>
    </div>
  )
}
