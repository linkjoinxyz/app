import { createContext, useContext, useState, useCallback } from 'react'
import { apiFetch } from '../api/client.js'

const AuthContext = createContext(null)

const TEACHER_ROLES = new Set(['teacher', 'school_admin', 'district_admin'])

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('lj_token'))
  const [email, setEmail] = useState(() => localStorage.getItem('lj_email'))
  const [confirmed, setConfirmed] = useState(() => {
    const stored = localStorage.getItem('lj_confirmed')
    // Existing sessions with no flag stored are assumed confirmed
    if (stored === null && localStorage.getItem('lj_token')) return true
    return stored === 'true'
  })
  const [accountType, setAccountType] = useState(() => localStorage.getItem('lj_account_type') || 'personal')
  const [role, setRole] = useState(() => localStorage.getItem('lj_role') || null)
  const [orgId, setOrgId] = useState(() => localStorage.getItem('lj_org_id') || null)

  const isTeacher = TEACHER_ROLES.has(role)

  const login = useCallback((accessToken, userEmail, isConfirmed = false, meta = {}) => {
    localStorage.setItem('lj_token', accessToken)
    localStorage.setItem('lj_email', userEmail)
    localStorage.setItem('lj_confirmed', isConfirmed ? 'true' : 'false')
    localStorage.setItem('lj_account_type', meta.account_type || 'personal')
    if (meta.role) localStorage.setItem('lj_role', meta.role)
    else localStorage.removeItem('lj_role')
    if (meta.org_id) localStorage.setItem('lj_org_id', meta.org_id)
    else localStorage.removeItem('lj_org_id')
    setToken(accessToken)
    setEmail(userEmail)
    setConfirmed(isConfirmed)
    setAccountType(meta.account_type || 'personal')
    setRole(meta.role || null)
    setOrgId(meta.org_id || null)
    window.postMessage({ type: 'lj:login' }, window.location.origin)
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('lj_token')
    localStorage.removeItem('lj_email')
    localStorage.removeItem('lj_confirmed')
    localStorage.removeItem('lj_account_type')
    localStorage.removeItem('lj_role')
    localStorage.removeItem('lj_org_id')
    setToken(null)
    setEmail(null)
    setConfirmed(false)
    setAccountType('personal')
    setRole(null)
    setOrgId(null)
    window.postMessage({ type: 'lj:logout' }, window.location.origin)
  }, [])

  return (
    <AuthContext.Provider value={{ token, email, confirmed, accountType, role, orgId, isTeacher, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
