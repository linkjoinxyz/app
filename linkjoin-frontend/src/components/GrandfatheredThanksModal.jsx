import { useModalClose } from '../hooks/useModalClose.js'
import { usersApi } from '../api/users.js'
import '../styles/modal.css'

export default function GrandfatheredThanksModal({ onClose }) {
  const { closing, handleClose } = useModalClose(onClose)

  function dismiss() {
    usersApi.markGrandfatheredNoteSeen().catch(() => {})
    handleClose()
  }

  return (
    <div className={`modal-overlay sn-page-overlay${closing ? ' closing' : ''}`} onClick={dismiss}>
      <div className="modal-card whats-new-card" onClick={e => e.stopPropagation()}>
        <div className="whats-new-header">
          <div className="whats-new-eyebrow">Thank you</div>
          <div className="modal-title" style={{ margin: 0, paddingLeft: 0 }}>You're on Premium, on us</div>
        </div>

        <p className="whats-new-desc" style={{ padding: '0 4px 8px' }}>
          You've been using LinkJoin since before Premium existed. As a thank-you, your
          account now has Premium permanently, at no cost. Attendance history,
          calendar import, AI email detection, and more. Nothing to do, nothing to pay.
        </p>

        <button className="modal-submit" onClick={dismiss}>Got it</button>
      </div>
    </div>
  )
}
