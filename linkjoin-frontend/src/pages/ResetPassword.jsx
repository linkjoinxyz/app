import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth.js'
import '../styles/auth-modal.css'
import '../styles/auth-pages.css'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleReset() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (!token) { setError('Invalid reset link.'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (e) {
      const detail = e.body?.detail
      const knownErrors = { token_expired: 'This reset link has expired. Please request a new one.', invalid_token: 'Invalid reset link.' }
      setError((typeof detail === 'string' && knownErrors[detail]) || 'Invalid or expired reset link.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <nav className="auth-page-nav">
        <Link to="/">
          <img src="/images/logo-text.svg" height="32" alt="LinkJoin" />
        </Link>
        <div className="auth-page-nav-aside">
          Remember it? <Link to="/login">Log in</Link>
        </div>
      </nav>

      <div className="auth-card">
        {done ? (
          <>
            <div className="auth-page-success-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ position: 'static', width: 24, height: 24 }}>
                <path d="M5 13l4 4L19 7" stroke="#2B8FD8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="auth-title">Password updated!</h2>
            <p className="auth-switch" style={{ marginBottom: 0 }}>
              Redirecting you to login&hellip;
            </p>
          </>
        ) : (
          <>
            <h2 className="auth-title" style={{ marginBottom: 8 }}>Set new password</h2>
            <p className="auth-switch" style={{ marginBottom: 24 }}>
              Choose a password at least 8 characters long.
            </p>

            {error && <div className="auth-error">{error}</div>}

            <div className="auth-field">
              <label className="auth-label">New password</label>
              <input
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyUp={e => e.key === 'Enter' && handleReset()}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Confirm password</label>
              <input
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyUp={e => e.key === 'Enter' && handleReset()}
              />
            </div>

            <button
              className={`auth-submit${loading ? ' disabled' : ''}`}
              onClick={handleReset}
              disabled={loading}
            >
              {!loading && 'Reset password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
