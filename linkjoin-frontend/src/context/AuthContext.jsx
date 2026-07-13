import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../api/client.js'

const AuthContext = createContext(null)

const TEACHER_ROLES = new Set(['teacher', 'school_admin', 'district_admin'])
const ADMIN_ROLES = new Set(['school_admin', 'district_admin'])

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('lj_token'))
  const [email, setEmail] = useState(() => localStorage.getItem('lj_email'))
  const [confirmed, setConfirmed] = useState(() => {
    const stored = localStorage.getItem('lj_confirmed')
    if (stored === null && localStorage.getItem('lj_token')) return true
    return stored === 'true'
  })
  const [accountType, setAccountType] = useState(() => localStorage.getItem('lj_account_type') || 'personal')
  const [role, setRole] = useState(() => localStorage.getItem('lj_role') || null)
  const [orgId, setOrgId] = useState(() => localStorage.getItem('lj_org_id') || null)
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('lj_admin') === 'true')
  const [onboardingDone, setOnboardingDone] = useState(() => localStorage.getItem('lj_onboarding_done') === 'true')
  const [mustChangePassword, setMustChangePassword] = useState(() => localStorage.getItem('lj_must_change_pw') === 'true')
  const [mfaEnabled, setMfaEnabledState] = useState(() => localStorage.getItem('lj_mfa_enabled') === 'true')

  const isTeacher = TEACHER_ROLES.has(role)
  const isOrgAdmin = ADMIN_ROLES.has(role)

  useEffect(() => {
    const storedToken = localStorage.getItem('lj_token')
    const storedEmail = localStorage.getItem('lj_email')
    if (!storedToken || !storedEmail) return
    apiFetch('/users/me').then(data => {
      if (!data?.username || data.username !== storedEmail) return
      const r = data.role || null
      const o = data.org_id || null
      const at = data.account_type || 'personal'
      const ob = data.onboarding_done !== false
      const adm = data.admin === 'true'
      const mfa = !!data.mfa_enabled
      if (r) localStorage.setItem('lj_role', r); else localStorage.removeItem('lj_role')
      if (o) localStorage.setItem('lj_org_id', o); else localStorage.removeItem('lj_org_id')
      localStorage.setItem('lj_account_type', at)
      localStorage.setItem('lj_onboarding_done', ob ? 'true' : 'false')
      if (adm) localStorage.setItem('lj_admin', 'true'); else localStorage.removeItem('lj_admin')
      if (mfa) localStorage.setItem('lj_mfa_enabled', 'true'); else localStorage.removeItem('lj_mfa_enabled')
      setRole(r)
      setOrgId(o)
      setAccountType(at)
      setOnboardingDone(ob)
      setIsAdmin(adm)
      setMfaEnabledState(mfa)
    }).catch(() => {})
  }, [])

  const login = useCallback((accessToken, userEmail, isConfirmed = false, meta = {}) => {
    localStorage.setItem('lj_token', accessToken)
    localStorage.setItem('lj_email', userEmail)
    localStorage.setItem('lj_confirmed', isConfirmed ? 'true' : 'false')
    localStorage.setItem('lj_account_type', meta.account_type || 'personal')
    if (meta.role) localStorage.setItem('lj_role', meta.role)
    else localStorage.removeItem('lj_role')
    if (meta.org_id) localStorage.setItem('lj_org_id', meta.org_id)
    else localStorage.removeItem('lj_org_id')
    if (meta.admin === 'true') localStorage.setItem('lj_admin', 'true')
    else localStorage.removeItem('lj_admin')
    const ob = meta.onboarding_done !== false
    localStorage.setItem('lj_onboarding_done', ob ? 'true' : 'false')
    const mcp = meta.must_change_password === true
    if (mcp) localStorage.setItem('lj_must_change_pw', 'true')
    else localStorage.removeItem('lj_must_change_pw')
    const mfa = !!meta.mfa_enabled
    if (mfa) localStorage.setItem('lj_mfa_enabled', 'true')
    else localStorage.removeItem('lj_mfa_enabled')
    setToken(accessToken)
    setEmail(userEmail)
    setConfirmed(isConfirmed)
    setAccountType(meta.account_type || 'personal')
    setRole(meta.role || null)
    setOrgId(meta.org_id || null)
    setIsAdmin(meta.admin === 'true')
    setOnboardingDone(ob)
    setMustChangePassword(mcp)
    setMfaEnabledState(mfa)
    window.postMessage({ type: 'lj:login' }, window.location.origin)
  }, [])

  const refreshAuth = useCallback((data) => {
    if (data.access_token !== undefined) { localStorage.setItem('lj_token', data.access_token); setToken(data.access_token) }
    if (data.account_type !== undefined) { localStorage.setItem('lj_account_type', data.account_type); setAccountType(data.account_type) }
    if (data.role !== undefined) {
      if (data.role) localStorage.setItem('lj_role', data.role); else localStorage.removeItem('lj_role')
      setRole(data.role || null)
    }
    if (data.org_id !== undefined) {
      if (data.org_id) localStorage.setItem('lj_org_id', data.org_id); else localStorage.removeItem('lj_org_id')
      setOrgId(data.org_id || null)
    }
  }, [])

  const markOnboardingDone = useCallback(() => {
    localStorage.setItem('lj_onboarding_done', 'true')
    setOnboardingDone(true)
  }, [])

  const clearMustChangePassword = useCallback(() => {
    localStorage.removeItem('lj_must_change_pw')
    setMustChangePassword(false)
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('lj_token')
    localStorage.removeItem('lj_email')
    localStorage.removeItem('lj_confirmed')
    localStorage.removeItem('lj_account_type')
    localStorage.removeItem('lj_role')
    localStorage.removeItem('lj_org_id')
    localStorage.removeItem('lj_admin')
    localStorage.removeItem('lj_onboarding_done')
    localStorage.removeItem('lj_must_change_pw')
    localStorage.removeItem('lj_mfa_enabled')
    setToken(null)
    setEmail(null)
    setConfirmed(false)
    setAccountType('personal')
    setRole(null)
    setOrgId(null)
    setIsAdmin(false)
    setOnboardingDone(false)
    setMustChangePassword(false)
    setMfaEnabledState(false)
    window.postMessage({ type: 'lj:logout' }, window.location.origin)
  }, [])

  const setMfaEnabled = useCallback((val) => {
    if (val) localStorage.setItem('lj_mfa_enabled', 'true')
    else localStorage.removeItem('lj_mfa_enabled')
    setMfaEnabledState(val)
  }, [])

  return (
    <AuthContext.Provider value={{
      token, email, confirmed, accountType, role, orgId,
      isAdmin, isTeacher, isOrgAdmin,
      onboardingDone, markOnboardingDone,
      mustChangePassword, clearMustChangePassword,
      mfaEnabled, setMfaEnabled,
      login, logout, refreshAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
