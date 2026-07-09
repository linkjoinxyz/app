import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost } from '../api/client.js'
import { authApi } from '../api/auth.js'
import '../styles/join-invite.css'

const ROLE_LABELS = {
  school_admin: 'School Administrator',
  teacher: 'Teacher',
  student: 'Student',
}

function AfterAcceptRedirect({ role }) {
  return role === 'student' ? '/meetings' : '/admin'
}

export default function JoinInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { token: authToken, email: authEmail, login, refreshAuth } = useAuth()

  const [invite, setInvite] = useState(null)
  const [loadErr, setLoadErr] = useState(null)
  const [loading, setLoading] = useState(true)

  // Signup form state (for unauthenticated users)
  const [formEmail, setFormEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formErr, setFormErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Accept state (for authenticated users)
  const [accepting, setAccepting] = useState(false)
  const [acceptErr, setAcceptErr] = useState('')

  useEffect(() => {
    apiGet(`/invites/${token}`)
      .then(data => {
        setInvite(data)
        if (data.email) setFormEmail(data.email)
      })
      .catch(err => {
        const detail = err?.detail || err?.message || 'This invite link is invalid or has expired.'
        setLoadErr(detail === 'Invite has expired' ? 'This invite link has expired.' : 'This invite link is invalid or has expired.')
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleAccept() {
    setAccepting(true)
    setAcceptErr('')
    try {
      const data = await apiPost(`/invites/${token}/accept`, {})
      refreshAuth(data)
      const dest = data.role === 'student' ? '/meetings' : '/admin'
      navigate(dest, { replace: true })
    } catch (err) {
      setAcceptErr(err?.detail || 'Failed to accept invite. Please try again.')
      setAccepting(false)
    }
  }

  async function handleSignupAndAccept(e) {
    e.preventDefault()
    if (!formEmail.trim() || !password) { setFormErr('Email and password are required.'); return }
    if (password.length < 8) { setFormErr('Password must be at least 8 characters.'); return }
    setSubmitting(true)
    setFormErr('')
    try {
      // Try register first; if account exists try login
      let data
      try {
        data = await authApi.register({ email: formEmail.trim().toLowerCase(), password })
      } catch (regErr) {
        if (regErr?.detail === 'email_in_use') {
          data = await authApi.login({ email: formEmail.trim().toLowerCase(), password })
        } else {
          throw regErr
        }
      }
      // Store auth
      login(data.access_token, data.email, data.confirmed ?? false, data)
      // Now accept
      const acceptData = await apiPost(`/invites/${token}/accept`, {})
      refreshAuth(acceptData)
      const dest = acceptData.role === 'student' ? '/meetings' : '/admin'
      navigate(dest, { replace: true })
    } catch (err) {
      const msg = err?.detail || err?.message || 'Something went wrong. Please try again.'
      const friendly = {
        email_in_use: 'An account with this email already exists.',
        'Invalid credentials': 'Incorrect password.',
        no_password: 'This email was registered with Google. Please use Google to sign in.',
      }
      setFormErr(friendly[msg] || msg)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="join-root">
        <div className="join-card">
          <div className="join-logo">LinkJoin</div>
          <div className="join-loading">Loading invite...</div>
        </div>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="join-root">
        <div className="join-card">
          <div className="join-logo">LinkJoin</div>
          <div className="join-error-state">
            <div className="join-error-icon">!</div>
            <div className="join-error-title">Invite not available</div>
            <div className="join-error-body">{loadErr}</div>
            <button className="join-btn" onClick={() => navigate('/login')}>Go to login</button>
          </div>
        </div>
      </div>
    )
  }

  const roleLabel = ROLE_LABELS[invite.role] || invite.role
  const isWrongEmail = authToken && invite.email && invite.email !== authEmail

  return (
    <div className="join-root">
      <div className="join-card">
        <div className="join-logo">LinkJoin</div>

        <div className="join-invite-meta">
          <div className="join-org">{invite.org_name}</div>
          <div className="join-role-badge">{roleLabel}</div>
          {invite.class_name && <div className="join-class-name">{invite.class_name}</div>}
        </div>

        <div className="join-title">You have been invited to join LinkJoin</div>

        {isWrongEmail ? (
          <div className="join-wrong-email">
            <p>This invite was sent to <strong>{invite.email}</strong>.</p>
            <p>You are signed in as <strong>{authEmail}</strong>.</p>
            <p>Sign out and sign in with the correct account to accept this invite.</p>
            <button className="join-btn join-btn--secondary" onClick={() => navigate('/login')}>Sign out and switch account</button>
          </div>
        ) : authToken ? (
          <div className="join-accept-section">
            <p className="join-accept-desc">
              Click below to accept the invitation and set your role to <strong>{roleLabel}</strong>
              {invite.org_name ? ` at ${invite.org_name}` : ''}.
            </p>
            {acceptErr && <div className="join-form-error">{acceptErr}</div>}
            <button className="join-btn" onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Accepting...' : 'Accept invitation'}
            </button>
          </div>
        ) : (
          <form className="join-form" onSubmit={handleSignupAndAccept}>
            <p className="join-form-desc">Create an account or sign in to accept this invitation.</p>
            <div className="join-field">
              <label className="join-label">Email</label>
              <input
                className="join-input"
                type="email"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                readOnly={!!invite.email}
              />
            </div>
            <div className="join-field">
              <label className="join-label">Password</label>
              <input
                className="join-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            {formErr && <div className="join-form-error">{formErr}</div>}
            <button className="join-btn" type="submit" disabled={submitting}>
              {submitting ? 'Setting up your account...' : 'Create account and accept'}
            </button>
            <div className="join-login-link">
              Already have an account? Your password will be used to sign in.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
