import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isAppRoute } from '../utils.js'
import '../styles/mfa-banner.css'

/**
 * An admin who has not enrolled MFA is 403'd by auth.get_confirmed_user on
 * everything outside a small self-service allowlist. Without this banner the
 * failures are silent: pages that swallow their fetch errors render an empty
 * state instead, so the admin dashboard cheerfully reports "No classes found in
 * your organization" while twelve requests are 403ing behind it. An admin would
 * reasonably conclude their data was gone.
 *
 * Reads the condition from AuthContext (computed off /users/me, which stays
 * reachable) rather than from a login response, so it survives a page refresh.
 */
export default function MfaSetupBanner() {
  const { mfaSetupRequired } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // The banner explains why *dashboard* data is 403ing, so it only belongs on
  // authenticated app routes — not the public homepage / marketing / auth pages.
  if (!mfaSetupRequired || !isAppRoute(pathname)) return null

  const onSettings = pathname.startsWith('/settings')

  return (
    <div className="mfa-banner" role="alert">
      <span className="mfa-banner-text">
        <strong>Two-factor authentication required.</strong>{' '}
        Administrator accounts need 2FA before they can access school data. Your
        classes, rosters and attendance are safe — they will reappear as soon as
        you finish setup.
      </span>
      {!onSettings && (
        <button className="mfa-banner-btn" onClick={() => navigate('/settings')}>
          Set up 2FA
        </button>
      )}
    </div>
  )
}
