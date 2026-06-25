import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { linksApi } from '../api/links.js'
import { openSafeUrl } from '../utils.js'

const DAYS_SHORT = { Sun: 'Su', Mon: 'M', Tue: 'Tu', Wed: 'W', Thu: 'Th', Fri: 'F', Sat: 'Sa' }

function detectPlatform(url) {
  if (!url) return null
  if (url.includes('zoom.us')) return 'Zoom'
  if (url.includes('meet.google')) return 'Meet'
  if (url.includes('teams.microsoft') || url.includes('teams.live')) return 'Teams'
  if (url.includes('webex')) return 'Webex'
  return null
}

function formatTime(time24) {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

export default function LinkCard({ link, isPending, onEdit, onShare, onDelete, onNotes, onToggle, isNext }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(link.active !== 'false')
  const menuBtnRef = useRef(null)
  const menuContentRef = useRef(null)

  useEffect(() => {
    setActive(link.active !== 'false')
  }, [link.active])

  useEffect(() => {
    function handleClick(e) {
      if (
        menuBtnRef.current && !menuBtnRef.current.contains(e.target) &&
        (!menuContentRef.current || !menuContentRef.current.contains(e.target))
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleToggle() {
    const next = !active
    setActive(next)
    onToggle?.(link.id, next ? 'true' : 'false')
    try {
      await linksApi.toggle(link.id, next ? 'true' : 'false')
    } catch {
      setActive(!next)
      onToggle?.(link.id, next ? 'false' : 'true')
    }
  }

  function handleOpen() {
    linksApi.trackOpen().catch(() => {})
    openSafeUrl(link.link)
  }

  function handleMenuToggle(e) {
    e.stopPropagation()
    if (!menuOpen) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      const estimatedHeight = 170
      const spaceBelow = window.innerHeight - rect.bottom - 6
      const spaceAbove = rect.top - 6
      let top
      if (spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove) {
        top = rect.bottom + 6
      } else {
        top = Math.max(6, rect.top - estimatedHeight - 6)
      }
      setMenuPos({ top, right: window.innerWidth - rect.right })
    }
    setMenuOpen(m => !m)
  }

  const isDisabled = !active
  const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = Array.isArray(link.days)
    ? [...link.days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    : []
  const platform = detectPlatform(link.link)

  function formatDays(d) {
    const sorted = d.join(',')
    if (sorted === 'Mon,Tue,Wed,Thu,Fri') return 'Weekdays'
    if (sorted === 'Sun,Mon,Tue,Wed,Thu,Fri,Sat') return 'Daily'
    return d.join(' · ')
  }

  return (
    <div
      className={`link link_event${isDisabled ? ' link-disabled' : ''}${expanded ? ' expanded' : ''}${isPending ? ' pending-link' : ''}${isNext ? ' link-next' : ''}`}
      id={`link-${link.id}`}
      onClick={handleOpen}
    >
      <div className="time">{formatTime(link.time)}</div>
      <div className="join-meeting">
        <div className="name">{link.name}</div>
        <div className="description">Click to open</div>
      </div>
      {platform && <span className={`lk-badge lk-badge-${platform.toLowerCase()}`}>{platform}</span>}
      <div className="days-dots">{formatDays(days)}</div>
      <div onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          className="switch-checkbox"
          id={`switch-${link.id}`}
          checked={active}
          onChange={handleToggle}
        />
        <label className="switch" htmlFor={`switch-${link.id}`} />
      </div>
      {isPending && (
        <div className="pending-link-actions" onClick={e => e.stopPropagation()}>
          <button
            className="pending-link-buttons accept"
            onClick={async () => {
              try { await linksApi.accept(link, true) } catch {}
            }}
          >Accept</button>
          <button
            className="pending-link-buttons decline"
            onClick={async () => {
              try { await linksApi.accept(link, false) } catch {}
            }}
          >Decline</button>
        </div>
      )}
      <img
        ref={menuBtnRef}
        src="/images/ellipsis.svg"
        className="dot-menu"
        alt="menu"
        onClick={handleMenuToggle}
      />
      {menuOpen && createPortal(
        <div
          ref={menuContentRef}
          className="menu"
          style={{ display: 'flex', position: 'fixed', ...menuPos, zIndex: 1000 }}
          onClick={e => e.stopPropagation()}
        >
          <div onClick={() => { setMenuOpen(false); onEdit(link) }}>Edit</div>
          <hr className="menu_line" />
          <div onClick={() => { setMenuOpen(false); onDelete(link) }}>Delete</div>
          <hr className="menu_line" />
          <div onClick={() => { setMenuOpen(false); onShare(link) }}>Share</div>
          <hr className="menu_line" />
          <div onClick={() => { setMenuOpen(false); onNotes(link) }}>Notes</div>
          {link.password && <>
            <hr className="menu_line" />
            <div onClick={() => {
              navigator.clipboard.writeText(link.password).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
              setMenuOpen(false)
            }}>{copied ? 'Copied!' : 'Password'}</div>
          </>}
        </div>,
        document.body
      )}
      <img
        src="/images/arrow-down.svg"
        className="link-expand"
        alt="expand"
        onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
      />
    </div>
  )
}
