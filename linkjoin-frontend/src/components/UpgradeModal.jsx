import { useState } from 'react'
import { useModalClose } from '../hooks/useModalClose.js'
import { billingApi } from '../api/billing.js'
import '../styles/modal.css'

export default function UpgradeModal({ feature, onClose }) {
  const { closing, handleClose } = useModalClose(onClose)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function upgrade() {
    setLoading(true)
    setError('')
    try {
      const { url } = await billingApi.checkout()
      window.location.href = url
    } catch {
      setError('Could not start checkout. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className={`modal-overlay sn-page-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="modal-card whats-new-card upgrade-modal-card" onClick={e => e.stopPropagation()}>
        <div className="upgrade-modal-icon">👑</div>
        <div className="whats-new-header">
          <div className="upgrade-modal-eyebrow">Premium feature</div>
          <div className="modal-title" style={{ margin: 0, paddingLeft: 0 }}>
            {feature ? `${feature} is part of Premium` : 'Upgrade to Premium'}
          </div>
        </div>

        <p className="whats-new-desc" style={{ padding: '0 4px 8px' }}>
          Unlock attendance history, calendar import, AI email detection, auto-delete,
          vacation mode, and open early for $5/month.
        </p>

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-submit upgrade-modal-submit" onClick={upgrade} disabled={loading}>
          {loading ? 'Loading…' : 'Upgrade now'}
        </button>
        <button className="modal-cancel-btn" onClick={handleClose}>Maybe later</button>
      </div>
    </div>
  )
}
