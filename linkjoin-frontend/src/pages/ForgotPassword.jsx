import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api/auth.js'
import '../styles/auth-modal.css'
import '../styles/auth-pages.css'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email) return
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch {
      setSent(true)
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
        {sent ? (
          <>
            <div className="auth-page-success-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ position: 'static', width: 24, height: 24 }}>
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#2B8FD8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="auth-title">Check your email</h2>
            <p className="auth-switch" style={{ marginBottom: 28, lineHeight: 1.7 }}>
              If an account with that email exists, you&apos;ll receive a reset link shortly.
            </p>
            <Link
              to="/login"
              className="auth-submit"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Back to login
            </Link>
          </>
        ) : (
          <>
            <h2 className="auth-title" style={{ marginBottom: 8 }}>Reset password</h2>
            <p className="auth-switch" style={{ marginBottom: 24 }}>
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyUp={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <button
              className={`auth-submit${loading ? ' disabled' : ''}`}
              onClick={handleSubmit}
              disabled={loading}
            >
              {!loading && 'Send reset link'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
