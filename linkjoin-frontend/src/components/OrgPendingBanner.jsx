import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isAppRoute } from '../utils.js'
import '../styles/mfa-banner.css'

/**
 * A self-serve school signup creates its org immediately, before anyone has
 * checked it is really a school. Until staff verify it, the org is capped at a
 * small number of seats and its members fall back to ordinary trial
 * entitlement (roles.is_premium / roles.assert_org_seats_available).
 *
 * Without this banner both limits are invisible: adding the eleventh member
 * just fails, and Premium features quietly expire with the trial, which reads
 * as the product being broken rather than as a step still outstanding.
 */
export default function OrgPendingBanner() {
  const { orgVerified, accountType } = useAuth()
  const { pathname } = useLocation()

  // orgVerified defaults true, so this stays hidden for every account that
  // predates verification and for anyone still loading /users/me.
  if (orgVerified || accountType !== 'institutional' || !isAppRoute(pathname)) return null

  return (
    <div className="mfa-banner" role="status">
      <span className="mfa-banner-text">
        <strong>Your organization is awaiting verification.</strong>{' '}
        You can set everything up and invite a small team in the meantime. We
        will confirm your school shortly, which lifts the member limit and
        switches you to the School plan.
      </span>
    </div>
  )
}
