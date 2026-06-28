import { Link } from 'react-router-dom'
import '../styles/pricing.css'

export default function PublicFooter() {
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
        </div>
        <div className="pf-col">
          <p className="pf-col-title">Account</p>
          <Link to="/login">Log In</Link>
          <Link to="/signup">Sign Up</Link>
        </div>
        <div className="pf-col">
          <p className="pf-col-title">Company</p>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/tos">Terms of Service</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
      <div className="pf-bottom">
        <span>© {new Date().getFullYear()} LinkJoin. All rights reserved.</span>
      </div>
    </footer>
  )
}
