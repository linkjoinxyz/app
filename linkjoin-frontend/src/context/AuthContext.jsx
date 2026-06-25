import { createContext, useContext, useState, useCallback } from 'react'
import { apiFetch } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('lj_token'))
  const [email, setEmail] = useState(() => localStorage.getItem('lj_email'))
  const [confirmed, setConfirmed] = useState(() => {
    const stored = localStorage.getItem('lj_confirmed')
    // Existing sessions with no flag stored are assumed confirmed
    if (stored === null && localStorage.getItem('lj_token')) return true
    return stored === 'true'
  })

  const login = useCallback((accessToken, userEmail, isConfirmed = false) => {
    localStorage.setItem('lj_token', accessToken)
    localStorage.setItem('lj_email', userEmail)
    localStorage.setItem('lj_confirmed', isConfirmed ? 'true' : 'false')
    setToken(accessToken)
    setEmail(userEmail)
    setConfirmed(isConfirmed)
    window.postMessage({ type: 'lj:login' }, window.location.origin)
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('lj_token')
    localStorage.removeItem('lj_email')
    localStorage.removeItem('lj_confirmed')
    setToken(null)
    setEmail(null)
    setConfirmed(false)
    window.postMessage({ type: 'lj:logout' }, window.location.origin)
  }, [])

  return (
    <AuthContext.Provider value={{ token, email, confirmed, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
