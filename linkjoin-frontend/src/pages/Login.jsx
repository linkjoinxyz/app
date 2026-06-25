import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { authApi } from '../api/auth.js'
import { safeRedirect } from '../utils.js'
import '../styles/login.css'

const GOOGLE_CLIENT_ID = '189748485716-d2pih6avqivdondcfjbt0ve8hkj33sts.apps.googleusercontent.com'

const ERROR_MESSAGES = {
  'Invalid credentials': 'Incorrect email or password.',
  email_in_use: 'An account with this email already exists. Please log in.',
  no_password: 'Please log in with Google.',
  not_confirmed: 'Please confirm your email before logging in.',
  google_login_failed: 'Google Login failed, please refresh and try again.',
  login_failed: 'Login failed, please refresh the page and try again.',
  not_logged_in: 'Log in to view your links',
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{
      position: 'static', zIndex: 'auto', height: 18, width: 18,
      fill: 'none', transform: 'none', flexShrink: 0,
    }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.861-3.048.861-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = safeRedirect(params.get('redirect'))

  const rawErrorParam = params.get('error')
  const [error, setError] = useState(ERROR_MESSAGES[rawErrorParam] ? rawErrorParam : '')
  const [emailVal, setEmailVal] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const hiddenGoogleRef = useRef(null)

  useEffect(() => {
    document.documentElement.id = 'login_html'
    document.documentElement.className = 'nobar'
    document.body.id = 'login_body'
    return () => {
      document.documentElement.id = ''
      document.documentElement.className = ''
      document.body.id = ''
    }
  }, [])

  useEffect(() => {
    let alive = true

    async function handleGoogleResponse(response) {
      if (!alive) return
      setLoading(true)
      setError('')
      try {
        const data = await authApi.googleLogin(response.credential, true)
        login(data.access_token, data.email, data.confirmed ?? true)
        navigate(redirect, { replace: true })
      } catch (e) {
        if (alive) { setError(e.body?.detail || 'google_login_failed'); setLoading(false) }
      }
    }

    function init() {
      if (!alive || !window.google) return
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleResponse })
      window.google.accounts.id.renderButton(hiddenGoogleRef.current, { type: 'standard', theme: 'outline', size: 'large' })
      if (window.innerWidth <= 600) window.google.accounts.id.cancel()
      if (alive) setGoogleReady(true)
    }

    if (window.google) {
      init()
    } else {
      let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
      if (!script) {
        script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        document.head.appendChild(script)
      }
      script.addEventListener('load', init)
    }

    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleGoogleClick() {
    if (!googleReady) return
    const btn = hiddenGoogleRef.current?.querySelector('[role="button"]')
    if (btn) btn.click()
    else window.google.accounts.id.prompt()
  }

  async function handleLogin() {
    setLoading(true)
    setError('')
    setShowReset(false)
    try {
      const data = await authApi.login({ email: emailVal, password })
      login(data.access_token, data.email, data.confirmed ?? false)
      navigate(redirect, { replace: true })
    } catch (e) {
      const detail = e.body?.detail || 'login_failed'
      setError(detail)
      setShowReset(true)
      setLoading(false)
    }
  }

  return (
    <div className="page-login">
      <nav className="auth-nav">
        <Link to="/" className="auth-nav-brand">
          <img src="/images/logo-text.svg" alt="LinkJoin" />
        </Link>
        <div className="auth-nav-aside">
          Don&apos;t have an account?
          <Link to={`/signup?redirect=${encodeURIComponent(redirect)}`}>Sign up</Link>
        </div>
      </nav>

      <div className="auth-card">
        <div className="auth-heading">Welcome back</div>
        <div className="auth-sub">Sign in to your account</div>

        {error && <div className="auth-error">{ERROR_MESSAGES[error] || error}</div>}

        <div ref={hiddenGoogleRef} aria-hidden="true" style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} />
        <button className="login-google-btn" onClick={handleGoogleClick} disabled={!googleReady}>
          <GoogleIcon />
          Continue with Google
        </button>
        <div className="login-or-div"><span>or</span></div>

        <input
          type="email" className="auth-input" placeholder="Email" required
          value={emailVal} onChange={e => setEmailVal(e.target.value)}
          onKeyUp={e => e.key === 'Enter' && handleLogin()}
        />
        <input
          className={`auth-input${showReset ? ' input-error' : ''}`} placeholder="Password" type="password" required
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyUp={e => e.key === 'Enter' && handleLogin()}
        />
        <Link to="/forgot-password" id="reset" style={{ display: showReset ? 'block' : 'none' }}>
          Forgot password?
        </Link>

        <button className="auth-submit" onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in…' : 'Log In'}
        </button>
      </div>
    </div>
  )
}
