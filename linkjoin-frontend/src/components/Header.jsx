import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Header({ onSettings, onAdd, page = 'links' }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header id="header-links">
      <Link to="/" id="home">
        <img src="/images/logo-text.svg" id="home_img" width="225" height="50" alt="LinkJoin" />
      </Link>

      {onAdd && (
        <img src="/images/plus.svg" className="plus_button" alt="Add" onClick={onAdd} />
      )}

      <div id="links_menu">
        <Link to={page === 'links' ? '/bookmarks' : '/links'}>
          <div className="button header_button underline">
            {page === 'links' ? 'Bookmarks' : 'Meetings'}
          </div>
        </Link>
        <a onClick={onSettings} style={{ cursor: 'pointer' }}>
          <div className="button header_button underline">Settings</div>
        </a>
        <a onClick={handleLogout} style={{ cursor: 'pointer' }}>
          <div className="button header_button underline">Log Out</div>
        </a>
      </div>

      <div id="dropdown" onClick={() => setMenuOpen(m => !m)}>
        <span /><span /><span />
        {menuOpen && (
          <div id="hamburger_dropdown" className="expand">
            <a href={page === 'links' ? '/bookmarks' : '/links'}>
              {page === 'links' ? 'Bookmarks' : 'Meetings'}
            </a>
            <hr className="menu_line" />
            <a onClick={onSettings} style={{ cursor: 'pointer' }}>Settings</a>
            <hr className="menu_line" />
            <a onClick={handleLogout} style={{ cursor: 'pointer' }}>Log Out</a>
          </div>
        )}
      </div>
    </header>
  )
}
