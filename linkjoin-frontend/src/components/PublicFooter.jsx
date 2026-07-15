import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/pricing.css'

export default function PublicFooter() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <footer className="pricing-footer">
      <div className="pf-brand">
        <img src="/images/logo-text.svg" height="28" alt="LinkJoin" />
        <p>Always on time.</p>
      </div>
      <div className="pf-cols">
        <div className="pf-col">
          <p className="pf-col-title">Product</p>
          <Link to="/meetings">Meetings</Link>
          <Link to="/bookmarks">Bookmarks</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/schools">Schools</Link>
        </div>
        <div className="pf-col">
          <p className="pf-col-title">Account</p>
          {token ? (
            <>
              <Link to="/meetings">My Meetings</Link>
              <button onClick={handleLogout} className="pf-logout-btn">Log Out</button>
            </>
          ) : (
            <>
              <Link to="/login">Log In</Link>
              <Link to="/signup">Sign Up</Link>
              <Link to="/forgot-password">Reset Password</Link>
            </>
          )}
        </div>
        <div className="pf-col">
          <p className="pf-col-title">Company</p>
          <Link to="/demo">Demo</Link>
          <Link to="/extension">Chrome Extension</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/tos">Terms of Service</Link>
          <Link to="/dpa">Data Processing Agreement</Link>
          <Link to="/privacy-schools">School Privacy</Link>
          <Link to="/subprocessors">Subprocessors</Link>
          <Link to="/sla">SLA</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
      <div className="pf-bottom">
        <span>© {new Date().getFullYear()} LinkJoin. All rights reserved.</span>
      </div>
    </footer>
  )
}
