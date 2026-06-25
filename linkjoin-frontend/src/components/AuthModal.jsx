import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { authApi } from '../api/auth.js'
import '../styles/auth-modal.css'

const GOOGLE_CLIENT_ID = '189748485716-d2pih6avqivdondcfjbt0ve8hkj33sts.apps.googleusercontent.com'

const LOGIN_ERRORS = {
  email_not_found: 'No account is associated with this email.',
  incorrect_password: 'Incorrect password.',
  no_password: 'Please log in with Google.',
  not_confirmed: 'Please confirm your email before logging in.',
  google_login_failed: 'Google login failed. Please try again.',
  login_failed: 'Login failed. Please try again.',
  not_logged_in: 'Log in to view your links.',
}

const SIGNUP_ERRORS = {
  invalid_email: 'Invalid email address.',
  password_too_short: 'Password must be at least 5 characters.',
  email_in_use: 'An account with this email already exists.',
  google_signup_failed: 'Google signup failed. Please try again.',
  signup_failed: 'Signup failed. Please try again.',
}

// Inline Google G SVG — bypasses the globals.css svg{} rule that breaks renderButton
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

export default function AuthModal({ mode: initialMode, onClose }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('1')
  const [countryCodes, setCountryCodes] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const modeRef = useRef(mode)
  const hiddenGoogleRef = useRef(null)
  useEffect(() => { modeRef.current = mode }, [mode])

  const offset = (() => {
    const raw = new Date().getTimezoneOffset() / 60
    return raw.toString().includes('.') ? raw.toString() : `${raw}.0`
  })()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    fetch('/country_codes.json').then(r => r.json()).then(setCountryCodes)
  }, [])

  useEffect(() => {
    let alive = true

    async function handleGoogle(response) {
      if (!alive) return
      setLoading(true)
      setError('')
      try {
        if (modeRef.current === 'login') {
          const data = await authApi.googleLogin(response.credential, true)
          login(data.access_token, data.email)
          navigate('/meetings', { replace: true })
        } else {
          const data = await authApi.googleRegister({ jwt: response.credential, offset, timezone })
          if (data.access_token) {
            login(data.access_token, data.email)
            navigate('/meetings', { replace: true })
          } else {
            if (alive) { setError('google_signup_failed'); setLoading(false) }
          }
        }
      } catch (e) {
        if (!alive) return
        const detail = e.body?.detail ?? (modeRef.current === 'login' ? 'google_login_failed' : 'google_signup_failed')
        if (detail === 'email_in_use') {
          setMode('login')
          setEmail(e.body?.email ?? '')
        } else {
          setError(detail)
        }
        setLoading(false)
      }
    }

    function init() {
      if (!alive || !window.google || !hiddenGoogleRef.current) return
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogle })
      // Render into a hidden off-screen container — globals.css corrupts SVGs globally,
      // so we proxy clicks from our styled button to this hidden real button.
      window.google.accounts.id.renderButton(hiddenGoogleRef.current, {
        type: 'standard', theme: 'outline', size: 'large',
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
    if (!googleReady) return
    const btn = hiddenGoogleRef.current?.querySelector('[role="button"]')
    if (btn) btn.click()
    else window.google.accounts.id.prompt()
  }

  function switchMode(m) {
    setMode(m)
    setEmail('')
    setPassword('')
    setPhone('')
    setError('')
    setShowReset(false)
  }

  async function handleLogin() {
    setLoading(true)
    setError('')
    setShowReset(false)
    try {
      const data = await authApi.login({ email, password })
      login(data.access_token, data.email)
      navigate('/meetings', { replace: true })
    } catch (e) {
      const detail = e.body?.detail || 'login_failed'
      setError(detail)
      if (detail !== 'email_not_found') setShowReset(true)
      setLoading(false)
    }
  }

  async function handleSignup() {
    setLoading(true)
    setError('')
    try {
      const data = await authApi.register({
        email, password, number: phone,
        countrycode: countryCode, offset, timezone,
      })
      if (data.access_token) {
        login(data.access_token, data.email)
        navigate('/meetings', { replace: true })
      } else {
        navigate('/login?error=not_confirmed')
      }
    } catch (e) {
      const detail = e.body?.detail || 'signup_failed'
      if (detail === 'email_in_use') switchMode('login')
      else setError(detail)
      setLoading(false)
    }
  }

  function adjustPadding(e) {
    const text = e.target.options[e.target.selectedIndex].text
    e.target.style.width = `${text.length * 9}px`
    const phoneInput = document.getElementById('modal-phone')
    if (phoneInput) phoneInput.style.paddingLeft = `${text.length * 10}px`
    setCountryCode(e.target.value)
  }

  const submitOnEnter = e => {
    if (e.key === 'Enter') mode === 'login' ? handleLogin() : handleSignup()
  }

  const ERRORS = mode === 'login' ? LOGIN_ERRORS : SIGNUP_ERRORS

  return (
    <div className="auth-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="auth-card" data-mode={mode}>

        <button className="auth-back" onClick={onClose} aria-label="Close">
          <img src="/images/arrow-left.svg" height="20" width="20" alt="back" />
        </button>

        <div className="auth-heading">
          <h2 className="auth-title">
            {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
          </h2>
          <p className="auth-switch">
            {mode === 'login' ? (
              <>Don't have an account?{' '}
                <button onClick={() => switchMode('signup')}>Sign up</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => switchMode('login')}>Log in</button>
              </>
            )}
          </p>
        </div>

        {error && (
          <div className="auth-error">
            {ERRORS[error] || error}
          </div>
        )}

        <div ref={hiddenGoogleRef} aria-hidden="true" style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} />

        <button
          className="auth-google-btn"
          onClick={handleGoogleClick}
          disabled={!googleReady}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="auth-or-div"><span>or</span></div>

        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input
            className="auth-input" type="email" placeholder="you@example.com" required
            value={email} onChange={e => setEmail(e.target.value)} onKeyUp={submitOnEnter}
            style={error === 'email_not_found' || error === 'invalid_email' ? { borderBottomColor: '#f87171' } : {}}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input
            className="auth-input" type="password" placeholder="••••••••" required
            value={password} onChange={e => setPassword(e.target.value)} onKeyUp={submitOnEnter}
            style={showReset || error === 'password_too_short' ? { borderBottomColor: '#f87171' } : {}}
          />
          {mode === 'login' && showReset && (
            <a href="/forgot-password" className="auth-reset">Forgot password?</a>
          )}
        </div>

        {mode === 'signup' && (
          <div className="auth-field">
            <label className="auth-label">Phone <span className="auth-optional">(optional)</span></label>
            <div className="auth-phone-container">
              <select className="auth-phone-select" style={{ width: 54 }} onChange={adjustPadding}>
                {Object.entries(countryCodes).map(([country, code]) => (
                  <option key={country} value={code}>{country}, +{code}</option>
                ))}
              </select>
              <input
                id="modal-phone" className="auth-input auth-input-phone"
                type="text" placeholder="(123) 456-7890"
                value={phone} onChange={e => setPhone(e.target.value)} onKeyUp={submitOnEnter}
              />
            </div>
          </div>
        )}

        <button
          className={`auth-submit${loading ? ' disabled' : ''}`}
          onClick={mode === 'login' ? handleLogin : handleSignup}
          disabled={loading}
        >
          {loading ? '' : (mode === 'login' ? 'Log in' : 'Create account')}
          {!loading && <img src="/images/arrow-right.svg" height="16" width="16" alt="" />}
        </button>
      </div>
    </div>
  )
}
