import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { usersApi } from '../api/users.js'
import { apiGet, apiPatch, apiPost } from '../api/client.js'
import countryCodes from '../../public/country_codes.json'
import '../styles/admin-onboarding.css'

function ProgressDots({ step, total }) {
  return (
    <div className="aob-dots" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`aob-dot${i + 1 === step ? ' aob-dot--active' : i + 1 < step ? ' aob-dot--done' : ''}`} />
      ))}
    </div>
  )
}

function StepSetPassword({ onNext, onBack }) {
  const { clearMustChangePassword, refreshAuth } = useAuth()
  const [phase, setPhase] = useState('form') // 'form' | 'verify'
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCountry, setPhoneCountry] = useState('1')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [err, setErr] = useState('')

  function fullPhone() { return phoneCountry + phone.replace(/\D/g, '') }

  async function handleSubmitForm() {
    if (newPw.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setErr('Passwords do not match.'); return }
    if (phone.replace(/\D/g, '').length < 7) { setErr('Enter a valid phone number.'); return }
    setSaving(true); setErr('')
    try {
      // Setting a password stamps the session epoch server-side, which revokes
      // the token this page is holding. The response carries a replacement, and
      // it has to be swapped in before the next call or that call 401s.
      const res = await apiPost('/auth/set-password', { new_password: newPw, confirm_password: confirmPw })
      if (res?.access_token) refreshAuth({ access_token: res.access_token })
      await apiPatch('/users/mfa', { enable: true, phone: fullPhone() })
      setPhase('verify')
    } catch (e) {
      setErr(e?.message || 'Something went wrong. Please try again.')
    }
    setSaving(false)
  }

  async function handleVerify() {
    if (code.length !== 6) { setErr('Enter the 6-digit code.'); return }
    setSaving(true); setErr('')
    try {
      await apiPost('/auth/mfa/setup-verify', { code })
      clearMustChangePassword()
      onNext()
    } catch (e) {
      setErr(e?.message || 'Invalid code. Please try again.')
      setSaving(false)
    }
  }

  async function handleResend() {
    setResending(true); setErr('')
    try {
      await apiPatch('/users/mfa', { enable: true, phone: fullPhone() })
    } catch (e) {
      setErr(e?.message || 'Could not resend code.')
    }
    setResending(false)
  }

  if (phase === 'verify') {
    return (
      <div className="aob-step-body">
        <div className="aob-step-title">Verify your phone</div>
        <div className="aob-step-desc">
          A 6-digit code was sent to +{fullPhone()}. Enter it to enable two-factor authentication on your account.
        </div>

        <div className="aob-field">
          <label className="aob-label" htmlFor="ob-mfa-code">Verification code</label>
          <input
            id="ob-mfa-code"
            className="aob-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setErr('') }}
            placeholder="000000"
            autoFocus
            autoComplete="one-time-code"
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
          />
        </div>

        {err && <div className="aob-error">{err}</div>}

        <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
          Didn't receive it?{' '}
          <button className="aob-link-btn" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        </div>

        <div className="aob-actions">
          <button className="aob-btn aob-btn--ghost" onClick={() => { setPhase('form'); setCode(''); setErr('') }}>Back</button>
          <button className="aob-btn aob-btn--primary" onClick={handleVerify} disabled={saving || code.length !== 6}>
            {saving ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="aob-step-body">
      <div className="aob-step-title">Create your password</div>
      <div className="aob-step-desc">Set a permanent password and add your phone number for two-factor authentication.</div>

      <div className="aob-field">
        <label className="aob-label" htmlFor="ob-new-pw">New password</label>
        <input
          id="ob-new-pw"
          className="aob-input"
          type="password"
          value={newPw}
          onChange={e => { setNewPw(e.target.value); setErr('') }}
          placeholder="At least 8 characters"
          autoFocus
          autoComplete="new-password"
        />
      </div>
      <div className="aob-field">
        <label className="aob-label" htmlFor="ob-confirm-pw">Confirm password</label>
        <input
          id="ob-confirm-pw"
          className="aob-input"
          type="password"
          value={confirmPw}
          onChange={e => { setConfirmPw(e.target.value); setErr('') }}
          placeholder="Re-enter your password"
          autoComplete="new-password"
        />
      </div>
      <div className="aob-field">
        <label className="aob-label" htmlFor="ob-phone">Phone number</label>
        <div className="aob-phone-row">
          <select className="aob-country-select" value={phoneCountry} onChange={e => setPhoneCountry(e.target.value)}>
            {Object.entries(countryCodes).map(([c, v]) => (
              <option key={c} value={v}>{c} +{v}</option>
            ))}
          </select>
          <input
            id="ob-phone"
            className="aob-phone-input"
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); setErr('') }}
            placeholder="555 555 1234"
            onKeyDown={e => e.key === 'Enter' && handleSubmitForm()}
            autoComplete="tel-national"
          />
        </div>
      </div>

      {err && <div className="aob-error">{err}</div>}

      <div className="aob-actions">
        {onBack && <button className="aob-btn aob-btn--ghost" onClick={onBack}>Back</button>}
        <button className="aob-btn aob-btn--primary" onClick={handleSubmitForm} disabled={saving || !newPw || !confirmPw || !phone}>
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function Step1OrgProfile({ onNext, onBack, form, setForm }) {
  const { orgId, refreshAuth } = useAuth()
  const [loading, setLoading] = useState(!form.name && !!orgId)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (form.name || !orgId) return
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
      if (orgId) {
        await apiPatch(`/orgs/${orgId}`, { name: form.name, type: form.type, address: form.address, city: form.city, state: form.state, website: form.website, timezone: form.timezone })
      } else {
        const res = await apiPost('/orgs/mine', { name: form.name, type: form.type, address: form.address, city: form.city, state: form.state, website: form.website, timezone: form.timezone })
        refreshAuth({ org_id: res.org_id })
      }
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
        {onBack && <button className="aob-btn aob-btn--ghost" onClick={onBack}>Back</button>}
        <button className="aob-btn aob-btn--primary" onClick={handleNext} disabled={saving || !form.name.trim()}>
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

const BLANK_ROW = () => ({ email: '', role: 'teacher', status: null })

function Step2InviteStaff({ onNext, onSkip, onBack, rows, setRows }) {
  const { orgId } = useAuth()
  const [sending, setSending] = useState(false)

  function setRow(i, key, val) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val, status: null } : r))
  }

  function addRow() {
    setRows(prev => [...prev, BLANK_ROW()])
  }

  function removeRow(i) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  const filledRows = rows.filter(r => r.email.trim())
  const sentCount = rows.filter(r => r.status === 'sent').length

  async function sendAll() {
    setSending(true)
    await Promise.all(
      rows.map(async (r, i) => {
        if (!r.email.trim() || r.status === 'sent') return
        try {
          await apiPost('/invites', { email: r.email.trim().toLowerCase(), role: r.role, org_id: orgId })
          setRows(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'sent' } : x))
        } catch {
          setRows(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'error' } : x))
        }
      })
    )
    setSending(false)
  }

  return (
    <div className="aob-step-body">
      <div className="aob-step-title">Invite your staff</div>
      <div className="aob-step-desc">Add email addresses for teachers and administrators. You can invite more later from the Admin dashboard.</div>

      <div className={`aob-invite-list${rows.length > 4 ? ' aob-invite-list--scroll' : ''}`}>
        {rows.map((row, i) => (
          <div key={i} className="aob-invite-row">
            <select
              className="aob-input aob-role-select"
              value={row.role}
              onChange={e => setRow(i, 'role', e.target.value)}
              aria-label="Role"
              disabled={row.status === 'sent'}
            >
              <option value="teacher">Teacher</option>
              <option value="school_admin">School Admin</option>
              <option value="district_admin">District Admin</option>
            </select>
            <input
              className={`aob-input aob-email-input${row.status === 'error' ? ' aob-input--error' : ''}`}
              type="email"
              value={row.email}
              onChange={e => setRow(i, 'email', e.target.value)}
              placeholder="name@school.edu"
              aria-label="Email address"
              disabled={row.status === 'sent'}
            />
            <span className="aob-row-status">
              {row.status === 'sent' && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              )}
              {row.status === 'error' && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              )}
              {row.status !== 'sent' && rows.length > 1 && (
                <button className="aob-remove-row" type="button" onClick={() => removeRow(i)} aria-label="Remove row">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <button className="aob-add-row" type="button" onClick={addRow}>+ Add another</button>

      <div className="aob-actions">
        <button className="aob-btn aob-btn--ghost" onClick={onBack}>Back</button>
        <button className="aob-btn aob-btn--ghost" onClick={onSkip}>Skip</button>
        {sentCount > 0
          ? <button className="aob-btn aob-btn--primary" onClick={onNext}>Continue</button>
          : <button className="aob-btn aob-btn--primary" onClick={sendAll} disabled={sending || filledRows.length === 0}>
              {sending ? 'Sending...' : 'Send invites'}
            </button>
        }
      </div>
    </div>
  )
}

function Step3Done({ onFinish, onBack }) {
  return (
    <div className="aob-step-body aob-step-body--center">
      <div className="aob-done-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
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
        <button className="aob-btn aob-btn--ghost" onClick={onBack}>Back</button>
        <button className="aob-btn aob-btn--primary" onClick={onFinish}>Go to dashboard</button>
      </div>
    </div>
  )
}

export default function AdminOnboarding() {
  const { markOnboardingDone, mustChangePassword, logout } = useAuth()
  const navigate = useNavigate()
  const totalSteps = mustChangePassword ? 4 : 3
  const [step, setStep] = useState(1)
  const [orgForm, setOrgForm] = useState({ name: '', type: 'school', address: '', city: '', state: '', website: '', timezone: '' })
  const [inviteRows, setInviteRows] = useState([BLANK_ROW()])

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ProgressDots step={step} total={totalSteps} />
            <button className="aob-signout" onClick={() => logout().then(() => navigate('/login'))}>Sign out</button>
          </div>
        </div>

        {step === 1 && <Step1OrgProfile onNext={() => setStep(2)} onBack={undefined} form={orgForm} setForm={setOrgForm} />}
        {step === 2 && <Step2InviteStaff onNext={() => mustChangePassword ? setStep(3) : setStep(4)} onSkip={() => mustChangePassword ? setStep(3) : setStep(4)} onBack={() => setStep(1)} rows={inviteRows} setRows={setInviteRows} />}
        {step === 3 && mustChangePassword && <StepSetPassword onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && <Step3Done onFinish={finish} onBack={() => mustChangePassword ? setStep(3) : setStep(2)} />}
      </div>
    </div>
  )
}
