import { useState } from 'react'
import { billingApi } from '../api/billing.js'

function daysRemaining(trialEnd) {
  if (!trialEnd) return 0
  // Backend serializes Mongo-read datetimes without a timezone suffix (naive),
  // even though they're stored as UTC — force UTC interpretation here so this
  // doesn't drift by the user's UTC offset.
  const iso = /[zZ]|[+-]\d\d:\d\d$/.test(trialEnd) ? trialEnd : `${trialEnd}Z`
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export default function BillingSection({ user, showToast }) {
  const [loading, setLoading] = useState(false)
  const status = user?.premium_status

  async function goToCheckout() {
    setLoading(true)
    try {
      const { url } = await billingApi.checkout()
      window.location.href = url
    } catch {
      showToast(false)
      setLoading(false)
    }
  }

  async function goToPortal() {
    setLoading(true)
    try {
      const { url } = await billingApi.portal()
      window.location.href = url
    } catch {
      showToast(false)
      setLoading(false)
    }
  }

  let statusLabel, statusDesc, action
  if (status === 'active') {
    statusLabel = 'Premium'
    statusDesc = 'Your subscription renews automatically.'
    action = <button className="settings-btn" onClick={goToPortal} disabled={loading}>Manage billing</button>
  } else if (status === 'grandfathered') {
    statusLabel = 'Premium'
    statusDesc = 'You have Premium permanently, free of charge. Thanks for being an early user.'
    action = null
  } else if (status === 'trial') {
    const days = daysRemaining(user?.trial_end)
    statusLabel = days > 0 ? `Free trial: ${days} day${days === 1 ? '' : 's'} left` : 'Trial ended'
    statusDesc = days > 0
      ? 'You have full access to Premium features during your trial.'
      : 'Your trial has ended. Upgrade to keep Premium features.'
    action = <button className="settings-btn" onClick={goToCheckout} disabled={loading}>Upgrade now</button>
  } else {
    statusLabel = 'Individual (free)'
    statusDesc = 'Upgrade to Premium for attendance history, calendar import, AI email detection, and more.'
    action = <button className="settings-btn" onClick={goToCheckout} disabled={loading}>Upgrade now</button>
  }

  return (
    <section className="settings-section">
      <div className="settings-section-title">Billing</div>
      <div className="settings-row settings-row--last">
        <div>
          <div className="settings-row-label">{statusLabel}</div>
          <div className="settings-row-desc">{statusDesc}</div>
        </div>
        {action}
      </div>
    </section>
  )
}
