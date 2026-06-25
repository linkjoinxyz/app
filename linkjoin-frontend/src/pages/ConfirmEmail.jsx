import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { authApi } from '../api/auth.js'

export default function ConfirmEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [status, setStatus] = useState('loading') // loading | success | already | error

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); return }

    authApi.confirmEmail(token)
      .then(data => {
        if (data.access_token) {
          login(data.access_token, data.email, true)
          setStatus('success')
          setTimeout(() => navigate('/meetings', { replace: true }), 1500)
        } else {
          setStatus('already')
        }
      })
      .catch(() => setStatus('error'))
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16,
      background: 'var(--dark)', color: 'white', textAlign: 'center', padding: 24,
    }}>
      {status === 'loading' && (
        <div style={{ fontSize: 18 }}>Confirming your email...</div>
      )}
      {status === 'success' && (
        <div style={{ fontSize: 18 }}>Email confirmed! Taking you to your links...</div>
      )}
      {status === 'already' && (
        <>
          <div style={{ fontSize: 18 }}>Your email is already confirmed.</div>
          <Link to="/login" style={{ color: 'var(--lightblue)', fontSize: 16 }}>Log in</Link>
        </>
      )}
      {status === 'error' && (
        <>
          <div style={{ fontSize: 18 }}>This confirmation link is invalid or has expired.</div>
          <Link to="/signup" style={{ color: 'var(--lightblue)', fontSize: 16 }}>Back to sign up</Link>
        </>
      )}
    </div>
  )
}
