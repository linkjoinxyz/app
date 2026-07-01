import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/header-modern.css'

const TEACHER_ROLES = new Set(['teacher', 'school_admin', 'district_admin'])

function NavLink({ to, active, children, onClick }) {
  if (active) return <span className="hm-nav-link hm-nav-link--active">{children}</span>
  return <Link to={to} className="hm-nav-link" onClick={onClick}>{children}</Link>
}

export default function HeaderModern({ onSettings, onAdd, page = 'links' }) {
  const { logout, role } = useAuth()
  const isTeacher = TEACHER_ROLES.has(role)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="hm-header">
      <Link to="/" className="hm-logo">
        <img src="/images/logo-text.svg" width="180" height="40" alt="LinkJoin" />
      </Link>

      <nav className="hm-nav">
        <NavLink to="/meetings" active={page === 'links'}>Meetings</NavLink>
        <NavLink to="/bookmarks" active={page === 'bookmarks'}>Bookmarks</NavLink>
        {isTeacher && <NavLink to="/admin" active={page === 'admin'}>Admin</NavLink>}
        <NavLink to="/settings" active={page === 'settings'}>Settings</NavLink>
        <button className="hm-nav-link" onClick={handleLogout}>Log Out</button>
        {onAdd && <button className="hm-add-btn" onClick={onAdd} aria-label="Add meeting">+</button>}
      </nav>

      <button className={`hm-hamburger${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(m => !m)} aria-label="Menu">
        <span /><span /><span />
      </button>

      {menuOpen && (
        <div className="hm-mobile-menu">
          <NavLink to="/meetings" active={page === 'links'} onClick={() => setMenuOpen(false)}>Meetings</NavLink>
          <NavLink to="/bookmarks" active={page === 'bookmarks'} onClick={() => setMenuOpen(false)}>Bookmarks</NavLink>
          {isTeacher && <NavLink to="/admin" active={page === 'admin'} onClick={() => setMenuOpen(false)}>Admin</NavLink>}
          <NavLink to="/settings" active={page === 'settings'} onClick={() => setMenuOpen(false)}>Settings</NavLink>
          <button onClick={handleLogout}>Log Out</button>
        </div>
      )}
    </header>
  )
}
