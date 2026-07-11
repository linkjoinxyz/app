import { useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/header-modern.css'
import '../styles/new-homepage.css'

export default function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="hm-header hm-public">
      <Link to="/" className="hm-logo">
        <img src="/images/logo-text.svg" width="180" height="40" alt="LinkJoin" />
      </Link>

      <nav className="hm-nav nh-nav-links">
        <div className="nh-nav-dropdown">
          <button className="nh-nav-dd-trigger hm-nav-link">
            Product
            <img src="/images/angle-down.svg" className="nh-nav-dd-chevron" width="14" height="14" alt="" aria-hidden="true" />
          </button>
          <div className="nh-nav-menu">
            <Link to="/meetings" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon"><img src="/images/link.svg" width="16" height="16" alt="" aria-hidden="true" /></span>
              <span>
                <span className="nh-nav-menu-label">Meetings</span>
                <span className="nh-nav-menu-sub">Auto-open meetings on time</span>
              </span>
            </Link>
            <Link to="/bookmarks" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 3h14v19l-7-4.5L5 22V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
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
          <button className="nh-nav-dd-trigger hm-nav-link">
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
              <span className="nh-nav-menu-icon"><img src="/images/school.svg" width="14" height="14" alt="" aria-hidden="true" /></span>
              <span>
                <span className="nh-nav-menu-label">Schools</span>
                <span className="nh-nav-menu-sub">K-12 attendance &amp; dashboards</span>
              </span>
            </Link>
            <Link to="/demo" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon nh-nav-menu-icon-text">▶</span>
              <span>
                <span className="nh-nav-menu-label">Demo</span>
                <span className="nh-nav-menu-sub">See LinkJoin in action</span>
              </span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="hm-nav-right">
        <div className="hm-nav-actions">
          <Link to="/login" className="hm-btn-ghost">Log In</Link>
          <Link to="/signup" className="hm-btn-primary">
            Get started <img src="/images/arrow-right.svg" height="14" width="14" alt="" />
          </Link>
        </div>

        <button
          className={`hm-hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(m => !m)}
          aria-label="Menu"
        >
          <span /><span /><span />
        </button>
      </div>

      {menuOpen && (
        <div className="hm-mobile-menu">
          <Link to="/login" onClick={() => setMenuOpen(false)}>Log In</Link>
          <Link to="/signup" onClick={() => setMenuOpen(false)}>Sign Up</Link>
          <p className="nh-mobile-menu-section">Product</p>
          <Link to="/meetings" onClick={() => setMenuOpen(false)}>Meetings</Link>
          <Link to="/bookmarks" onClick={() => setMenuOpen(false)}>Bookmarks</Link>
          <p className="nh-mobile-menu-section">Resources</p>
          <Link to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <Link to="/schools" onClick={() => setMenuOpen(false)}>Schools</Link>
          <Link to="/demo" onClick={() => setMenuOpen(false)}>Demo</Link>
        </div>
      )}
    </header>
  )
}
