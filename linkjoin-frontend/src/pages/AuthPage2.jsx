import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { authApi } from '../api/auth.js'
import { safeRedirect } from '../utils.js'
import '../styles/auth-page.css'
import '../styles/auth-page-2.css'

const GOOGLE_CLIENT_ID = '189748485716-d2pih6avqivdondcfjbt0ve8hkj33sts.apps.googleusercontent.com'

const ERROR_MESSAGES = {
  'Invalid credentials': 'Incorrect email or password.',
  email_in_use: 'An account with this email already exists. Try logging in.',
  no_password: 'This account was created with Google. Use "Continue with Google" to sign in.',
  not_confirmed: 'Please confirm your email before signing in.',
  invalid_email: 'Please enter a valid email address.',
  password_too_short: 'Password must be at least 8 characters.',
  google_login_failed: 'Google sign-in failed. Please try again.',
  google_signup_failed: 'Google sign-up failed. Please try again.',
  login_failed: 'Sign-in failed. Please try again.',
  signup_failed: 'Sign-up failed. Please try again.',
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ position: 'static', zIndex: 'auto', height: 18, width: 18, fill: 'none', transform: 'none', flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.861-3.048.861-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

function ProductDemo() {
  return (
    <div className="a2-right">
      <div className="a2-stack">

        {/* Back card */}
        <div className="a2-card a2-card-c">
          <div className="a2-card-time">4:00</div>
          <div className="a2-card-period">PM</div>
          <div className="a2-card-name">Eng Standup</div>
          <div className="a2-card-meta">
            <span className="a2-card-badge a2-badge-meet">Meet</span>
            <span className="a2-card-days">Mon · Wed · Fri</span>
          </div>
        </div>

        {/* Middle card */}
        <div className="a2-card a2-card-b">
          <div className="a2-card-time">2:30</div>
          <div className="a2-card-period">PM</div>
          <div className="a2-card-name">1:1 with Sarah</div>
          <div className="a2-card-meta">
            <span className="a2-card-badge a2-badge-teams">Teams</span>
            <span className="a2-card-days">Daily</span>
          </div>
        </div>

        {/* Front card */}
        <div className="a2-card a2-card-a">
          <div className="a2-card-time">11:00</div>
          <div className="a2-card-period">AM</div>
          <div className="a2-card-name">Weekly Sync</div>
          <div className="a2-card-meta">
            <span className="a2-card-badge a2-badge-zoom">Zoom</span>
            <span className="a2-card-days">Mon · Wed · Fri</span>
          </div>
        </div>

      </div>
      <div className="a2-caption">Your meetings, handled.</div>
    </div>
  )
}

export default function AuthPage2({ defaultTab = 'login' }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = safeRedirect(params.get('redirect'))

  const [tab, setTab] = useState(defaultTab)
  const [headingDir, setHeadingDir] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const rawErrorParam = params.get('error')
  const [error, setError] = useState(ERROR_MESSAGES[rawErrorParam] ? rawErrorParam : '')
  const [loading, setLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)

  const hiddenGoogleRef = useRef(null)
  const tabRef = useRef(tab)

  const offset = new Date().getTimezoneOffset() / 60
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    document.documentElement.className = 'nobar'
    return () => { document.documentElement.className = '' }
  }, [])

  useEffect(() => { tabRef.current = tab }, [tab])

  useEffect(() => {
    let alive = true

    async function handleGoogleResponse(response) {
      if (!alive) return
      setLoading(true)
      setError('')
      try {
        let data
        if (tabRef.current === 'login') {
          data = await authApi.googleLogin(response.credential, true)
        } else {
          data = await authApi.googleRegister({ jwt: response.credential, offset, timezone })
          if (!data?.access_token) throw { body: { detail: 'google_signup_failed' } }
        }
        login(data.access_token, data.email, data.confirmed ?? true)
        navigate(redirect, { replace: true })
      } catch (e) {
        if (!alive) return
        const detail = e.body?.detail || (tabRef.current === 'login' ? 'google_login_failed' : 'google_signup_failed')
        setError(detail)
        setLoading(false)
      }
    }

    function init() {
      if (!alive || !window.google) return
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleResponse })
      window.google.accounts.id.renderButton(hiddenGoogleRef.current, { type: 'standard', theme: 'outline', size: 'large' })
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

  function switchTab(next) {
    if (next === tab) return
    setHeadingDir(next === 'signup' ? 'up' : 'down')
    setTab(next)
    setError('')
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      if (tab === 'login') {
        const data = await authApi.login({ email, password })
        login(data.access_token, data.email, data.confirmed ?? false)
        navigate(redirect, { replace: true })
      } else {
        const data = await authApi.register({ email, password, offset, timezone })
        if (data.access_token) {
          login(data.access_token, data.email, data.confirmed ?? false)
          navigate(redirect, { replace: true })
        }
      }
    } catch (e) {
      const raw = e.body?.detail
      let detail
      if (Array.isArray(raw)) {
        const locs = raw.flatMap(err => err.loc ?? []).map(s => String(s))
        if (locs.includes('password')) detail = 'password_too_short'
        else if (locs.includes('email')) detail = 'invalid_email'
        else detail = tab === 'login' ? 'login_failed' : 'signup_failed'
      } else {
        detail = raw || (tab === 'login' ? 'login_failed' : 'signup_failed')
      }
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  const isLogin = tab === 'login'

  return (
    <div className="ap-split">

      {/* ── LEFT: Form panel (same as AuthPage, tab toggle restored) ── */}
      <div className="ap-left">
        <div className="ap-logo-wrap">
          <Link to="/"><img src="/images/logo-text.svg" alt="LinkJoin" /></Link>
        </div>

        <div className="ap-mobile-bar">
          <Link to="/"><img src="/images/logo-text.svg" alt="LinkJoin" /></Link>
        </div>

        <div className="ap-form-outer">
          <div className="ap-form-wrap">
            <div ref={hiddenGoogleRef} aria-hidden="true" style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} />

            {/* Animated heading */}
            <div className="ap-heading-wrap">
              <h1
                key={tab}
                className={`ap-heading${headingDir ? ` ap-heading-${headingDir}` : ''}`}
              >
                {isLogin ? 'Welcome back.' : 'Create your account.'}
              </h1>
            </div>

            {/* Tab toggle */}
            <div className="ap-tabs">
              <div className={`ap-tab-slider${isLogin ? '' : ' ap-tab-slider-right'}`} />
              <button className={`ap-tab${isLogin ? ' active' : ''}`} onClick={() => switchTab('login')}>Log in</button>
              <button className={`ap-tab${!isLogin ? ' active' : ''}`} onClick={() => switchTab('signup')}>Sign up</button>
            </div>

            {error && <div className="ap-error">{ERROR_MESSAGES[error] || error}</div>}

            <button className="ap-google-btn" onClick={handleGoogleClick} disabled={!googleReady || loading}>
              <GoogleIcon />
              {isLogin ? 'Continue with Google' : 'Sign up with Google'}
            </button>

            <div className="ap-divider">or</div>

            <input
              type="email"
              className={`ap-input${error === 'invalid_email' ? ' ap-input-error' : ''}`}
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoComplete="email"
            />
            <input
              type="password"
              className={`ap-input${error === 'password_too_short' ? ' ap-input-error' : ''}`}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />

            <Link to="/forgot-password" className="ap-forgot" style={isLogin ? {} : { visibility: 'hidden' }}>Forgot password?</Link>

            <button className="ap-submit" onClick={handleSubmit} disabled={loading}>
              {loading
                ? (isLogin ? 'Signing in…' : 'Creating account…')
                : (isLogin ? 'Log In' : 'Create Account')}
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Product demo ── */}
      <ProductDemo />

    </div>
  )
}
