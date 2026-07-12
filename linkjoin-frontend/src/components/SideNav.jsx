import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useDarkMode } from '../hooks/useDarkMode.js'
import { useExtDetection } from '../hooks/useExtDetection.js'
import '../styles/side-nav.css'

const TEACHER_ROLES = new Set(['teacher', 'school_admin', 'district_admin'])

const ICONS = {
  meetings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  bookmarks: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v19l-7-4.5L5 22V3z"/></svg>,
  admin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  parent: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  profile: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  notes: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  platform: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
}

function NavItem({ to, icon, label, active, collapsed, onClick }) {
  const cls = `sn-item${active ? ' sn-item--active' : ''}`
  const content = (
    <>
      <span className="sn-item-icon">{icon}</span>
      <span className="sn-item-label">{label}</span>
    </>
  )
  if (active) return <span className={cls} onClick={onClick}>{content}</span>
  return <Link to={to} className={cls} onClick={onClick}>{content}</Link>
}

export default function SideNav({ onAdd, page, search, onSearch, searchPlaceholder }) {
  const { logout, role, isAdmin } = useAuth()
  const isTeacher = TEACHER_ROLES.has(role)
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { installed, checked, browser, installUrl } = useExtDetection()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('lj_side_collapsed') === '1'
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [extDismissed, setExtDismissed] = useState(
    () => sessionStorage.getItem('lj_ext_dismissed') === '1'
  )

  const showExtBanner = checked && !installed && !extDismissed && browser !== 'other'

  useEffect(() => {
    document.documentElement.style.setProperty('--sn-w', collapsed ? '60px' : '220px')
    return () => document.documentElement.style.removeProperty('--sn-w')
  }, [collapsed])

  function toggle() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem('lj_side_collapsed', next ? '1' : '0')
      return next
    })
  }

  async function handleLogout() {
    await logout()
    window.location.href = '/login'
  }

  const chevronExpand = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
  const chevronCollapse = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>

  function closeMobile() { setMobileOpen(false) }

  return (
    <>
      {/* Mobile hamburger button */}
      <button className="sn-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && <div className="sn-backdrop" onClick={closeMobile} />}

      {showExtBanner && (
        <div className="sn-ext-banner">
          {browser === 'firefox' ? (
            <span>Firefox extension coming soon. <a className="sn-ext-install" href="/schools">Learn more</a></span>
          ) : (
            <>
              <span>Install the extension to open meetings automatically.</span>
              {installUrl && <a className="sn-ext-install" href={installUrl} target="_blank" rel="noopener noreferrer">Add to Chrome</a>}
            </>
          )}
          <button className="sn-ext-dismiss" aria-label="Dismiss" onClick={() => { sessionStorage.setItem('lj_ext_dismissed', '1'); setExtDismissed(true) }}>✕</button>
        </div>
      )}

      <aside className={`sn-sidebar${collapsed ? ' sn-collapsed' : ''}${mobileOpen ? ' sn-mobile-open' : ''}`}>
        <div className="sn-inner">

        <div className="sn-top">
          <Link to="/" className="sn-logo">
            {collapsed
              ? <img src="/images/logo.svg" className="sn-logo-icon" alt="LinkJoin" />
              : <img src="/images/logo-text.svg" className="sn-logo-text" alt="LinkJoin" />
            }
          </Link>
          {onAdd && (
            <button className="sn-add-btn" onClick={onAdd} aria-label={page === 'bookmarks' ? 'Add bookmark' : 'Add meeting'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span className="sn-add-btn-label">{page === 'bookmarks' ? 'Add bookmark' : 'Add meeting'}</span>
            </button>
          )}
        </div>

        <nav className="sn-nav">
          {onSearch && !collapsed && (
            <div className="sn-search">
              <svg className="sn-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="sn-search-input"
                placeholder={searchPlaceholder || 'Search meetings…'}
                value={search}
                onChange={e => onSearch(e.target.value)}
              />
              {search && <button className="sn-search-clear" onClick={() => onSearch('')} aria-label="Clear search">✕</button>}
            </div>
          )}
          <NavItem to="/meetings"  icon={ICONS.meetings}  label="Meetings"     active={page === 'links'}     collapsed={collapsed} onClick={closeMobile} />
          <NavItem to="/bookmarks" icon={ICONS.bookmarks} label="Bookmarks"    active={page === 'bookmarks'} collapsed={collapsed} onClick={closeMobile} />
          <NavItem to="/notes"     icon={ICONS.notes}     label="Notes"        active={page === 'notes'}     collapsed={collapsed} onClick={closeMobile} />
          {isTeacher && <NavItem to="/admin"   icon={ICONS.admin}    label="Admin"        active={page === 'admin'}     collapsed={collapsed} onClick={closeMobile} />}
          {role === 'parent'  && <NavItem to="/parent"  icon={ICONS.parent}   label="Parent Portal" active={page === 'parent'}   collapsed={collapsed} onClick={closeMobile} />}
          {role === 'student' && <NavItem to="/profile" icon={ICONS.profile}  label="Profile"      active={page === 'profile'}   collapsed={collapsed} onClick={closeMobile} />}
          <NavItem to="/settings"  icon={ICONS.settings}  label="Settings"     active={page === 'settings'}  collapsed={collapsed} onClick={closeMobile} />
          {isAdmin && <NavItem to="/platform" icon={ICONS.platform} label="Platform"     active={page === 'platform'}  collapsed={collapsed} onClick={closeMobile} />}
        </nav>

        <div className="sn-bottom">
          <button className="sn-item" onClick={() => { closeMobile(); handleLogout() }}>
            <span className="sn-item-icon">{ICONS.logout}</span>
            <span className="sn-item-label">Log Out</span>
          </button>
        </div>
        </div>{/* sn-inner */}

        <button className="sn-toggle" onClick={toggle} aria-label={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? chevronExpand : chevronCollapse}
        </button>

      </aside>
    </>
  )
}
