import { useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/header-modern.css'

export default function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="hm-header hm-public">
      <Link to="/" className="hm-logo">
        <img src="/images/logo-text.svg" width="180" height="40" alt="LinkJoin" />
      </Link>

      <nav className="hm-nav">
        <Link to="/meetings" className="hm-nav-link">Meetings</Link>
        <Link to="/bookmarks" className="hm-nav-link">Bookmarks</Link>
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
          <Link to="/meetings" onClick={() => setMenuOpen(false)}>Meetings</Link>
          <Link to="/bookmarks" onClick={() => setMenuOpen(false)}>Bookmarks</Link>
        </div>
      )}
    </header>
  )
}
