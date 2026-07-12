import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/new-homepage.css'

export default function NhNav({ onLogin, onSignup }) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogin = onLogin ?? (() => navigate('/login'))
  const handleSignup = onSignup ?? (() => navigate('/signup'))

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav className={`nh-nav${scrolled ? ' nh-nav-compact' : ''}`}>
      <Link to="/" className="nh-nav-logo">
        <img src="/images/logo-text.svg" height="32" alt="LinkJoin" />
      </Link>

      <div className="nh-nav-links">
        <div className="nh-nav-dropdown">
          <button className="nh-nav-dd-trigger">
            Product
            <img src="/images/angle-down.svg" className="nh-nav-dd-chevron" width="14" height="14" alt="" aria-hidden="true" />
          </button>
          <div className="nh-nav-menu">
            <Link to="/meetings" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon">
                <img src="/images/link.svg" width="16" height="16" alt="" aria-hidden="true" />
              </span>
              <span>
                <span className="nh-nav-menu-label">Meetings</span>
                <span className="nh-nav-menu-sub">Auto-open meetings on time</span>
              </span>
            </Link>
            <Link to="/bookmarks" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 3h14v19l-7-4.5L5 22V3z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
                </svg>
              </span>
              <span>
                <span className="nh-nav-menu-label">Bookmarks</span>
                <span className="nh-nav-menu-sub">Save links for quick access</span>
              </span>
            </Link>
          </div>
        </div>

        <div className="nh-nav-dropdown">
          <button className="nh-nav-dd-trigger">
            Resources
            <img src="/images/angle-down.svg" className="nh-nav-dd-chevron" width="14" height="14" alt="" aria-hidden="true" />
          </button>
          <div className="nh-nav-menu">
            <Link to="/pricing" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon nh-nav-menu-icon-text">$</span>
              <span>
                <span className="nh-nav-menu-label">Pricing</span>
                <span className="nh-nav-menu-sub">Plans for every team size</span>
              </span>
            </Link>
            <Link to="/schools" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon">
                <img src="/images/school.svg" width="14" height="14" alt="" aria-hidden="true" />
              </span>
              <span>
                <span className="nh-nav-menu-label">Schools</span>
                <span className="nh-nav-menu-sub">K-12 attendance &amp; dashboards</span>
              </span>
            </Link>
            <Link to="/demo" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>
                </svg>
              </span>
              <span>
                <span className="nh-nav-menu-label">Demo</span>
                <span className="nh-nav-menu-sub">See LinkJoin in action</span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      <div className="nh-nav-right">
        <div className="nh-nav-actions">
          {token ? (
            <Link to="/meetings" className="nh-btn-primary">
              Dashboard <img src="/images/arrow-right.svg" height="14" width="14" alt="" />
            </Link>
          ) : (
            <>
              <button className="nh-btn-ghost nh-nav-login" onClick={handleLogin}>Log In</button>
              <button className="nh-btn-primary nh-nav-cta" onClick={handleSignup}>
                Get started <img src="/images/arrow-right.svg" height="14" width="14" alt="" />
              </button>
            </>
          )}
        </div>

        <button
          className={`nh-hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(m => !m)}
          aria-label="Menu"
        >
          <span /><span /><span />
        </button>
      </div>

      {menuOpen && (
        <div className="nh-mobile-menu">
          <button className="nh-menu-login" onClick={() => { setMenuOpen(false); handleLogin() }}>Log In</button>
          <button className="nh-menu-cta" onClick={() => { setMenuOpen(false); handleSignup() }}>Sign Up</button>
          <p className="nh-mobile-menu-section">Product</p>
          <Link to="/meetings" onClick={() => setMenuOpen(false)}>Meetings</Link>
          <Link to="/bookmarks" onClick={() => setMenuOpen(false)}>Bookmarks</Link>
          <p className="nh-mobile-menu-section">Resources</p>
          <Link to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <Link to="/schools" onClick={() => setMenuOpen(false)}>Schools</Link>
          <Link to="/demo" onClick={() => setMenuOpen(false)}>Demo</Link>
        </div>
      )}
    </nav>
  )
}
