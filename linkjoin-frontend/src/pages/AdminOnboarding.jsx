import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { usersApi } from '../api/users.js'
import { apiGet, apiPatch, apiPost } from '../api/client.js'
import '../styles/admin-onboarding.css'

const TOTAL_STEPS = 3

function ProgressDots({ step }) {
  return (
    <div className="aob-dots" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <span key={i} className={`aob-dot${i + 1 === step ? ' aob-dot--active' : i + 1 < step ? ' aob-dot--done' : ''}`} />
      ))}
    </div>
  )
}

function Step1OrgProfile({ onNext }) {
  const { orgId } = useAuth()
  const [form, setForm] = useState({ name: '', type: 'school', address: '', city: '', state: '', website: '', timezone: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    apiGet(`/orgs/${orgId}`).then(data => {
      if (data) setForm(f => ({
        ...f,
        name: data.name || '',
        type: data.type || 'school',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        website: data.website || '',
        timezone: data.timezone || '',
      }))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [orgId])

  async function handleNext() {
    if (!form.name.trim()) { setErr('Organization name is required.'); return }
    setSaving(true)
    setErr('')
    try {
      if (orgId) await apiPatch(`/orgs/${orgId}`, { name: form.name, type: form.type, address: form.address, city: form.city, state: form.state, website: form.website, timezone: form.timezone })
      onNext()
    } catch (e) {
      setErr(e?.message || 'Could not save. Please try again.')
    }
    setSaving(false)
  }

  if (loading) return <div className="aob-loading">Loading...</div>

  return (
    <div className="aob-step-body">
      <div className="aob-step-title">Set up your organization</div>
      <div className="aob-step-desc">Confirm your school or district details. You can change these later in Settings.</div>

      <div className="aob-field">
        <label className="aob-label" htmlFor="ob-org-name">Organization name *</label>
        <input id="ob-org-name" className="aob-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Lincoln Middle School" />
      </div>

      <div className="aob-row">
        <div className="aob-field">
          <label className="aob-label">Type</label>
          <div className="aob-type-group">
            {['school', 'district'].map(t => (
              <button key={t} className={`aob-type-btn${form.type === t ? ' aob-type-btn--active' : ''}`} onClick={() => setForm(f => ({ ...f, type: t }))}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="aob-field">
          <label className="aob-label" htmlFor="ob-city">City</label>
          <input id="ob-city" className="aob-input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Springfield" />
        </div>
      </div>

      <div className="aob-field">
        <label className="aob-label" htmlFor="ob-website">Website (optional)</label>
        <input id="ob-website" className="aob-input" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://lincoln.edu" />
      </div>

      {err && <div className="aob-error">{err}</div>}

      <div className="aob-ferpa-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>
          By using LinkJoin with students, your school accepts the role of FERPA School Official.{' '}
          <a href="/dpa" className="aob-ferpa-link" target="_blank" rel="noopener noreferrer">Data Processing Agreement</a>
          {' '}&middot;{' '}
          <a href="/privacy-schools" className="aob-ferpa-link" target="_blank" rel="noopener noreferrer">School Privacy Policy</a>
        </span>
      </div>

      <div className="aob-actions">
        <button className="aob-btn aob-btn--primary" onClick={handleNext} disabled={saving || !form.name.trim()}>
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function Step2InviteStaff({ onNext, onSkip }) {
  const { orgId } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('teacher')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState([])
  const [err, setErr] = useState('')

  async function sendInvite(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setErr('')
    try {
      await apiPost('/invites', { email: email.trim(), role, org_id: orgId })
      setSent(prev => [...prev, { email: email.trim(), role }])
      setEmail('')
    } catch (ex) {
      setErr(ex?.message || 'Invite failed. Check the email address and try again.')
    }
    setSending(false)
  }

  return (
    <div className="aob-step-body">
      <div className="aob-step-title">Invite your staff</div>
      <div className="aob-step-desc">Send email invites to teachers and other administrators. You can also do this later from the Admin dashboard.</div>

      <form className="aob-invite-form" onSubmit={sendInvite}>
        <select className="aob-input aob-role-select" value={role} onChange={e => setRole(e.target.value)} aria-label="Role">
          <option value="teacher">Teacher</option>
          <option value="school_admin">School Admin</option>
          <option value="district_admin">District Admin</option>
        </select>
        <input
          className="aob-input aob-email-input"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="teacher@school.edu"
          aria-label="Email address"
        />
        <button className="aob-btn aob-btn--primary" type="submit" disabled={sending || !email.trim()}>
          {sending ? 'Sending...' : 'Invite'}
        </button>
      </form>

      {err && <div className="aob-error">{err}</div>}

      {sent.length > 0 && (
        <div className="aob-sent-list">
          {sent.map((s, i) => (
            <div key={i} className="aob-sent-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{s.email}</span>
              <span className="aob-sent-role">{s.role.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="aob-actions">
        <button className="aob-btn aob-btn--ghost" onClick={onSkip}>Skip for now</button>
        {sent.length > 0 && (
          <button className="aob-btn aob-btn--primary" onClick={onNext}>Continue</button>
        )}
      </div>
    </div>
  )
}

function Step3Done({ onFinish }) {
  return (
    <div className="aob-step-body aob-step-body--center">
      <div className="aob-done-icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div className="aob-step-title">You're set up!</div>
      <div className="aob-step-desc">
        Your organization is configured. Teachers you invited will receive an email with setup instructions.
        You can manage everything from your admin dashboard.
      </div>

      <div className="aob-done-tips">
        <div className="aob-done-tip">
          <strong>Next:</strong> Have teachers create their classes and share join codes with students.
        </div>
        <div className="aob-done-tip">
          <strong>Attendance:</strong> Once students join classes, attendance tracking starts automatically.
        </div>
      </div>

      <div className="aob-actions aob-actions--center">
        <button className="aob-btn aob-btn--primary" onClick={onFinish}>Go to dashboard</button>
      </div>
    </div>
  )
}

export default function AdminOnboarding() {
  const { markOnboardingDone } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  async function finish() {
    markOnboardingDone()
    try { await usersApi.completeOnboarding() } catch {}
    navigate('/admin')
  }

  return (
    <div className="aob-root">
      <div className="aob-card">
        <div className="aob-header">
          <img src="/images/logo-text.svg" width="140" height="32" alt="LinkJoin" />
          <ProgressDots step={step} />
        </div>

        {step === 1 && <Step1OrgProfile onNext={() => setStep(2)} />}
        {step === 2 && <Step2InviteStaff onNext={() => setStep(3)} onSkip={() => setStep(3)} />}
        {step === 3 && <Step3Done onFinish={finish} />}
      </div>
    </div>
  )
}
