import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/header-modern.css'

export default function HeaderModern({ onSettings, onAdd, page = 'links' }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const otherPage = page === 'links' ? '/bookmarks' : '/meetings'
  const otherLabel = page === 'links' ? 'Bookmarks' : 'Meetings'

  return (
    <header className="hm-header">
      <Link to="/" className="hm-logo">
        <img src="/images/logo-text.svg" width="180" height="40" alt="LinkJoin" />
      </Link>

      <nav className="hm-nav">
        <Link to={otherPage} className="hm-nav-link">
          {otherLabel}
        </Link>
        <button className="hm-nav-link" onClick={onSettings}>Settings</button>
        <button className="hm-nav-link" onClick={handleLogout}>Log Out</button>
        {onAdd && (
          <button className="hm-add-btn" onClick={onAdd} aria-label="Add meeting">+</button>
        )}
      </nav>

      <button className={`hm-hamburger${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(m => !m)} aria-label="Menu">
        <span /><span /><span />
      </button>

      {menuOpen && (
        <div className="hm-mobile-menu">
          <Link to={otherPage} onClick={() => setMenuOpen(false)}>{otherLabel}</Link>
          <button onClick={() => { setMenuOpen(false); onSettings?.() }}>Settings</button>
          <button onClick={handleLogout}>Log Out</button>
        </div>
      )}
    </header>
  )
}
