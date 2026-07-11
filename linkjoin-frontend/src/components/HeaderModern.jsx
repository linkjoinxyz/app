import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useExtDetection } from '../hooks/useExtDetection.js'
import { useDarkMode } from '../hooks/useDarkMode.js'
import '../styles/header-modern.css'

const TEACHER_ROLES = new Set(['teacher', 'school_admin', 'district_admin'])

function NavLink({ to, active, children, onClick }) {
  if (active) return <span className="hm-nav-link hm-nav-link--active">{children}</span>
  return <Link to={to} className="hm-nav-link" onClick={onClick}>{children}</Link>
}

function ExtBanner({ browser, installUrl, onDismiss }) {
  if (browser === 'other') return null
  return (
    <div className="hm-ext-banner" role="banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {browser === 'firefox' ? (
        <span>The Firefox extension is coming soon. <a className="hm-ext-link" href="https://linkjoin.xyz/schools" target="_blank" rel="noopener noreferrer">Learn more</a></span>
      ) : (
        <span>Install the browser extension to open meetings automatically.</span>
      )}
      {installUrl && (
        <a className="hm-ext-install-btn" href={installUrl} target="_blank" rel="noopener noreferrer">
          Add to Chrome
        </a>
      )}
      <button className="hm-ext-dismiss" onClick={onDismiss} aria-label="Dismiss extension banner">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}

function ThemeToggle({ isDark, toggle }) {
  return (
    <button className="hm-theme-toggle" onClick={toggle} aria-label="Toggle light/dark mode">
      {isDark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}

export default function HeaderModern({ onSettings, onAdd, page = 'links' }) {
  const { logout, role, isAdmin } = useAuth()
  const isTeacher = TEACHER_ROLES.has(role)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [extDismissed, setExtDismissed] = useState(() => sessionStorage.getItem('lj_ext_dismissed') === '1')
  const { installed, checked, browser, installUrl } = useExtDetection()
  const { isDark, toggle } = useDarkMode()

  const showExtBanner = checked && !installed && !extDismissed

  function handleDismissExt() {
    sessionStorage.setItem('lj_ext_dismissed', '1')
    setExtDismissed(true)
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <>
      {showExtBanner && <ExtBanner browser={browser} installUrl={installUrl} onDismiss={handleDismissExt} />}
      <header className="hm-header">
        <Link to="/" className="hm-logo">
          <img src="/images/logo-text.svg" width="180" height="40" alt="LinkJoin" />
        </Link>

        <nav className="hm-nav" aria-label="Main navigation">
          <NavLink to="/meetings" active={page === 'links'}>Meetings</NavLink>
          <NavLink to="/bookmarks" active={page === 'bookmarks'}>Bookmarks</NavLink>
          {isTeacher && <NavLink to="/admin" active={page === 'admin'}>Admin</NavLink>}
          {role === 'parent' && <NavLink to="/parent" active={page === 'parent'}>Parent Portal</NavLink>}
          {role === 'student' && <NavLink to="/profile" active={page === 'profile'}>Profile</NavLink>}
          <NavLink to="/settings" active={page === 'settings'}>Settings</NavLink>
          {isAdmin && <NavLink to="/platform" active={page === 'platform'}>Platform</NavLink>}
          <ThemeToggle isDark={isDark} toggle={toggle} />
          <button className="hm-nav-link" onClick={handleLogout}>Log Out</button>
          {onAdd && <button className="hm-add-btn" onClick={onAdd} aria-label="Add meeting">+</button>}
        </nav>

        <button className={`hm-hamburger${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(m => !m)} aria-label="Open menu" aria-expanded={menuOpen}>
          <span /><span /><span />
        </button>

        {menuOpen && (
          <div className="hm-mobile-menu" role="dialog" aria-label="Navigation menu">
            <NavLink to="/meetings" active={page === 'links'} onClick={() => setMenuOpen(false)}>Meetings</NavLink>
            <NavLink to="/bookmarks" active={page === 'bookmarks'} onClick={() => setMenuOpen(false)}>Bookmarks</NavLink>
            {isTeacher && <NavLink to="/admin" active={page === 'admin'} onClick={() => setMenuOpen(false)}>Admin</NavLink>}
            {role === 'parent' && <NavLink to="/parent" active={page === 'parent'} onClick={() => setMenuOpen(false)}>Parent Portal</NavLink>}
            {role === 'student' && <NavLink to="/profile" active={page === 'profile'} onClick={() => setMenuOpen(false)}>Profile</NavLink>}
            <NavLink to="/settings" active={page === 'settings'} onClick={() => setMenuOpen(false)}>Settings</NavLink>
            {isAdmin && <NavLink to="/platform" active={page === 'platform'} onClick={() => setMenuOpen(false)}>Platform</NavLink>}
            <ThemeToggle isDark={isDark} toggle={toggle} />
            <button onClick={handleLogout}>Log Out</button>
          </div>
        )}
      </header>
    </>
  )
}
