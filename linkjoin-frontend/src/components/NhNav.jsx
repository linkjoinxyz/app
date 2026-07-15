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
            <Link to="/extension" className="nh-nav-menu-item">
              <span className="nh-nav-menu-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="14" height="14" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
                </svg>
              </span>
              <span>
                <span className="nh-nav-menu-label">Chrome Extension</span>
                <span className="nh-nav-menu-sub">Auto-open, notifications, and more</span>
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
          <Link to="/extension" onClick={() => setMenuOpen(false)}>Chrome Extension</Link>
          <p className="nh-mobile-menu-section">Resources</p>
          <Link to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <Link to="/schools" onClick={() => setMenuOpen(false)}>Schools</Link>
          <Link to="/demo" onClick={() => setMenuOpen(false)}>Demo</Link>
        </div>
      )}
    </nav>
  )
}
