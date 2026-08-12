import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../api/client.js'
import { trialDaysRemaining } from '../utils.js'

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
  const [premiumStatus, setPremiumStatus] = useState(() => localStorage.getItem('lj_premium_status') || null)
  const [trialEnd, setTrialEnd] = useState(() => localStorage.getItem('lj_trial_end') || null)
  // Self-serve orgs are seat-capped and on trial entitlement until staff verify.
  // Defaults true so nothing is restricted before /users/me has answered.
  const [orgVerified, setOrgVerified] = useState(() => localStorage.getItem('lj_org_verified') !== 'false')
  // Mirrors the gate in auth.get_confirmed_user: an admin with neither MFA
  // enrolled nor a phone number is 403'd on everything outside a small
  // self-service allowlist. Computed from /users/me (which stays reachable) so it
  // survives a refresh, not just the login response.
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)

  const isTeacher = TEACHER_ROLES.has(role)
  const isOrgAdmin = ADMIN_ROLES.has(role)
  // Backend serializes Mongo-read datetimes without a timezone suffix (naive),
  // even though they're stored as UTC — force UTC interpretation here so this
  // doesn't drift by the user's UTC offset.
  const trialEndIso = trialEnd && !/[zZ]|[+-]\d\d:\d\d$/.test(trialEnd) ? `${trialEnd}Z` : trialEnd
  // UX precomputation only — never trusted for real access control, which always
  // lives server-side via require_premium(). Institutional accounts don't carry
  // premium_status at all, so accountType covers them here.
  const trialDaysLeft = premiumStatus === 'trial' ? trialDaysRemaining(trialEnd) : null

  const isPremium = accountType === 'institutional'
    || premiumStatus === 'active'
    || premiumStatus === 'grandfathered'
    || (premiumStatus === 'trial' && !!trialEndIso && new Date(trialEndIso) > new Date())

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
      const premStatus = data.premium_status || null
      const trEnd = data.trial_end || null
      // Explicit false only. Missing means an account that predates
      // verification, which stays unrestricted — mirrors roles.is_premium.
      const orgVer = data.org_verified !== false
      if (r) localStorage.setItem('lj_role', r); else localStorage.removeItem('lj_role')
      if (o) localStorage.setItem('lj_org_id', o); else localStorage.removeItem('lj_org_id')
      localStorage.setItem('lj_account_type', at)
      localStorage.setItem('lj_onboarding_done', ob ? 'true' : 'false')
      if (adm) localStorage.setItem('lj_admin', 'true'); else localStorage.removeItem('lj_admin')
      if (mfa) localStorage.setItem('lj_mfa_enabled', 'true'); else localStorage.removeItem('lj_mfa_enabled')
      if (premStatus) localStorage.setItem('lj_premium_status', premStatus); else localStorage.removeItem('lj_premium_status')
      if (trEnd) localStorage.setItem('lj_trial_end', trEnd); else localStorage.removeItem('lj_trial_end')
      localStorage.setItem('lj_org_verified', orgVer ? 'true' : 'false')
      setOrgVerified(orgVer)
      setRole(r)
      setOrgId(o)
      setAccountType(at)
      setOnboardingDone(ob)
      setIsAdmin(adm)
      setMfaEnabledState(mfa)
      setPremiumStatus(premStatus)
      setTrialEnd(trEnd)
      // Same condition the server applies. `number` counts because an admin with
      // a phone gets MFA-challenged at login even before running the enable flow.
      const adminRole = adm || r === 'school_admin' || r === 'district_admin'
      setMfaSetupRequired(Boolean(adminRole) && !mfa && !data.number)
    }).catch(() => {})
  }, [token])

  const login = useCallback((accessToken, userEmail, isConfirmed = false, meta = {}) => {
    localStorage.setItem('lj_token', accessToken)
    // Access tokens expire in an hour; this is what silently renews them (see
    // refreshSession in api/client.js). Absent on older responses, so guard.
    if (meta.refresh_token) localStorage.setItem('lj_refresh_token', meta.refresh_token)
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
    if (data.refresh_token !== undefined) { localStorage.setItem('lj_refresh_token', data.refresh_token) }
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
    localStorage.removeItem('lj_refresh_token')
    localStorage.removeItem('lj_email')
    localStorage.removeItem('lj_confirmed')
    localStorage.removeItem('lj_account_type')
    localStorage.removeItem('lj_role')
    localStorage.removeItem('lj_org_id')
    localStorage.removeItem('lj_admin')
    localStorage.removeItem('lj_onboarding_done')
    localStorage.removeItem('lj_must_change_pw')
    localStorage.removeItem('lj_mfa_enabled')
    localStorage.removeItem('lj_premium_status')
    localStorage.removeItem('lj_trial_end')
    localStorage.removeItem('lj_org_verified')
    setToken(null)
    setEmail(null)
    setConfirmed(false)
    setOrgVerified(true)
    setAccountType('personal')
    setRole(null)
    setOrgId(null)
    setIsAdmin(false)
    setOnboardingDone(false)
    setMustChangePassword(false)
    setMfaEnabledState(false)
    setPremiumStatus(null)
    setTrialEnd(null)
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
      mfaEnabled, setMfaEnabled, mfaSetupRequired,
      premiumStatus, trialEnd, isPremium, trialDaysLeft, orgVerified,
      login, logout, refreshAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
