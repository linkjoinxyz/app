import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { authApi } from '../api/auth.js'
import { safeRedirect } from '../utils.js'
import '../styles/login.css'

const GOOGLE_CLIENT_ID = '189748485716-d2pih6avqivdondcfjbt0ve8hkj33sts.apps.googleusercontent.com'

const ERROR_MESSAGES = {
  invalid_email: 'Invalid email.',
  password_too_short: 'Password must be at least 8 characters.',
  email_in_use: 'An account with this email already exists.',
  google_signup_failed: 'Google signup failed, please refresh and try again.',
  signup_failed: 'Signup failed, please refresh the page and try again.',
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

export default function Signup() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = safeRedirect(params.get('redirect'))

  const [error, setError] = useState('')
  const [emailVal, setEmailVal] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('1')
  const [countryCodes, setCountryCodes] = useState({})
  const [loading, setLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const tokenClientRef = useRef(null)

  const offset = new Date().getTimezoneOffset() / 60
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

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
    fetch('/country_codes.json').then(r => r.json()).then(setCountryCodes)
  }, [])

  useEffect(() => {
    let alive = true

    function init() {
      if (!alive || !window.google) return
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: async (response) => {
          if (!alive) return
          if (response.error) { setError('google_signup_failed'); return }
          setLoading(true)
          setError('')
          try {
            const data = await authApi.googleTokenLogin(response.access_token)
            if (data.access_token) {
              login(data.access_token, data.email, data.confirmed ?? true)
              navigate(redirect, { replace: true })
            } else {
              if (alive) { setError('google_signup_failed'); setLoading(false) }
            }
          } catch (e) {
            if (!alive) return
            const detail = e.body?.detail || 'google_signup_failed'
            if (detail === 'email_in_use') {
              navigate('/login?error=email_in_use')
            } else {
              setError(detail)
              setLoading(false)
            }
          }
        },
      })
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
    if (!googleReady || !tokenClientRef.current) return
    tokenClientRef.current.requestAccessToken({ prompt: 'select_account' })
  }

  async function handleSignup() {
    setLoading(true)
    setError('')
    try {
      const data = await authApi.register({
        email: emailVal, password, number: phone,
        countrycode: countryCode, offset, timezone,
      })
      if (data.access_token) {
        login(data.access_token, data.email, data.confirmed ?? false)
        navigate(redirect, { replace: true })
      }
    } catch (e) {
      const raw = e.body?.detail
      let detail
      if (Array.isArray(raw)) {
        const locs = raw.flatMap(err => err.loc ?? []).map(s => String(s))
        if (locs.includes('password')) detail = 'password_too_short'
        else if (locs.includes('email')) detail = 'invalid_email'
        else detail = 'signup_failed'
      } else {
        detail = raw || 'signup_failed'
      }
      if (detail === 'email_in_use') {
        navigate('/login?error=email_in_use')
      } else {
        setError(detail)
      }
    } finally {
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
          Already have an account?
          <Link to={`/login?redirect=${encodeURIComponent(redirect)}`}>Log in</Link>
        </div>
      </nav>

      <div className="auth-card">
        <div className="auth-heading">Create an account</div>
        <div className="auth-sub">Get started with LinkJoin</div>

        {error && <div className="auth-error">{ERROR_MESSAGES[error] || error}</div>}

        <button className="login-google-btn" onClick={handleGoogleClick} disabled={!googleReady}>
          <GoogleIcon />
          Continue with Google
        </button>
        <div className="login-or-div"><span>or</span></div>

        <input
          type="email" className={`auth-input${error === 'invalid_email' ? ' input-error' : ''}`}
          name="email" placeholder="Email" required
          value={emailVal} onChange={e => setEmailVal(e.target.value)}
          onKeyUp={e => e.key === 'Enter' && handleSignup()}
        />
        <input
          className={`auth-input${error === 'password_too_short' ? ' input-error' : ''}`}
          name="password" placeholder="Password" type="password" required
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyUp={e => e.key === 'Enter' && handleSignup()}
        />

        <div className="auth-phone-row">
          <select
            className="auth-phone-select"
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
          >
            {Object.entries(countryCodes).map(([country, code]) => (
              <option key={country} value={code}>{country} +{code}</option>
            ))}
          </select>
          <input
            className="auth-input auth-phone-input"
            name="phone" type="text" placeholder="Phone (optional)"
            value={phone} onChange={e => setPhone(e.target.value)}
            onKeyUp={e => e.key === 'Enter' && handleSignup()}
          />
        </div>

        <button className="auth-submit" onClick={handleSignup} disabled={loading}>
          {loading ? 'Creating account…' : 'Sign Up'}
        </button>
      </div>
    </div>
  )
}
