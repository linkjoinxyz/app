import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useWebSocket } from '../hooks/useWebSocket.js'
import { useAutoOpen } from '../hooks/useAutoOpen.js'
import { usersApi } from '../api/users.js'
import { authApi } from '../api/auth.js'
import { linksApi } from '../api/links.js'
import Header from '../components/HeaderModern.jsx'
import LinkCard from '../components/LinkCard.jsx'
import LinkModal from '../components/LinkModal.jsx'
import ShareModal from '../components/ShareModal.jsx'
import DeleteModal from '../components/DeleteModal.jsx'
import SettingsModal from '../components/SettingsModal.jsx'
import NotesModal from '../components/NotesModal.jsx'
import CalendarPanel from '../components/CalendarPanel.jsx'
import CalendarImportModal from '../components/CalendarImportModal.jsx'
import OnboardingCard from '../components/OnboardingCard.jsx'
import WhatsNewModal from '../components/WhatsNewModal.jsx'
import '../styles/links.css'
import '../styles/new_links.css'
import '../styles/calendar-panel.css'
import '../styles/calendar-import.css'
import '../styles/link.css'
import '../styles/onboarding.css'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_ORDER = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

function parseMDY(str) {
  const [mo, dy, yr] = str.split('/').map(Number)
  return new Date(yr, mo - 1, dy)
}

function getLinkMins(link) {
  const [h, m] = (link.time || '0:0').split(':').map(Number)
  return h * 60 + m
}

function getMinDayOrder(link) {
  if (link.repeat === 'never' && link.date) {
    const dow = DAY_NAMES[parseMDY(link.date).getDay()]
    return DAY_ORDER[dow] ?? 7
  }
  const days = Array.isArray(link.days) ? link.days : []
  return days.reduce((min, d) => Math.min(min, DAY_ORDER[d] ?? 7), 7)
}

function effectiveDomDate(year, month, dayNum) {
  const d = new Date(year, month, dayNum)
  if (d.getMonth() !== month) return null
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() + 2)
  if (dow === 0) d.setDate(d.getDate() + 1)
  return d
}

function minutesUntilNext(link, now) {
  const todayIdx = now.getDay()
  const currentMins = now.getHours() * 60 + now.getMinutes()
  const [h, m] = (link.time || '0:0').split(':').map(Number)
  const linkMins = h * 60 + m

  if (link.repeat === 'never') {
    if (!link.date) return Infinity
    const d = parseMDY(link.date)
    d.setHours(h, m, 0, 0)
    return Math.max(0, (d - now) / 60000)
  }

  const days = Array.isArray(link.days) ? link.days : []

  if (!link.repeat || link.repeat === 'week') {
    for (let d = 0; d < 8; d++) {
      if (!days.includes(DAY_NAMES[(todayIdx + d) % 7])) continue
      const minsAway = d * 1440 + linkMins - currentMins
      if (minsAway > 0) return minsAway
    }
    return Infinity
  }

  if (link.repeat === 'month') {
    const parts = (link.date || '').split('/')
    const refDay = parts.length === 3 ? parseInt(parts[1], 10) : NaN
    const weekNum = (!isNaN(refDay) && refDay >= 1) ? Math.ceil(refDay / 7) : 1
    for (let i = 0; i <= 62; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      if (days.includes(DAY_NAMES[d.getDay()]) && Math.ceil(d.getDate() / 7) === weekNum) {
        const minsAway = i * 1440 + linkMins - currentMins
        if (minsAway > 0) return minsAway
      }
    }
    return Infinity
  }

  if (/^day \d+$/.test(link.repeat)) {
    const dayNum = parseInt(link.repeat.split(' ')[1])
    for (let i = 0; i <= 62; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      const eff = effectiveDomDate(d.getFullYear(), d.getMonth(), dayNum)
      if (eff && d.getDate() === eff.getDate() && d.getMonth() === eff.getMonth()) {
        const minsAway = i * 1440 + linkMins - currentMins
        if (minsAway > 0) return minsAway
      }
    }
    return Infinity
  }

  if (link.repeat === 'same_weekday') {
    for (let i = 1; i <= 62; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      const d1dow = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
      const fbd = d1dow === 0 ? 2 : d1dow === 6 ? 3 : 1
      if (d.getDate() === fbd) {
        const minsAway = i * 1440 + linkMins - currentMins
        if (minsAway > 0) return minsAway
      }
    }
    return Infinity
  }

  const n = parseInt(link.repeat)
  if (n > 1 && link.date) {
    const start = parseMDY(link.date)
    for (let d = 0; d < 365; d++) {
      const check = new Date(now)
      check.setDate(now.getDate() + d)
      if (!days.includes(DAY_NAMES[check.getDay()])) continue
      const diffDays = Math.round((check - start) / 86400000)
      if (diffDays < 0) continue
      if (Math.round(diffDays / 7) % n !== 0) continue
      const minsAway = d * 1440 + linkMins - currentMins
      if (minsAway > 0) return minsAway
    }
  }

  return Infinity
}

function sortLinks(links, sort) {
  if (!sort || sort === 'None') return links
  const arr = [...links]
  if (sort === 'Day & Time') {
    return arr.sort((a, b) => {
      const diff = getMinDayOrder(a) - getMinDayOrder(b)
      return diff !== 0 ? diff : getLinkMins(a) - getLinkMins(b)
    })
  }
  if (sort === 'Upcoming') {
    const now = new Date()
    return arr.sort((a, b) => {
      const aMins = a.active === 'false' ? Infinity : minutesUntilNext(a, now)
      const bMins = b.active === 'false' ? Infinity : minutesUntilNext(b, now)
      return aMins - bMins
    })
  }
  return arr
}

function findNextLinkId(links) {
  const now = new Date()
  let bestId = null
  let bestMins = Infinity

  for (const link of links) {
    if (link.active === 'false') continue
    const mins = minutesUntilNext(link, now)
    if (mins > 0 && mins < bestMins) { bestId = link.id; bestMins = mins }
  }
  return bestId
}

export default function Links() {
  const { token, email, confirmed } = useAuth()
  const [user, setUser] = useState(null)
  const [links, setLinks] = useState([])
  const [pendingLinks, setPendingLinks] = useState([])
  const [deletedLinks, setDeletedLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [search, setSearch] = useState('')

  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editLink, setEditLink] = useState(null)
  const [calPrefillDays, setCalPrefillDays] = useState(null)
  const [calPrefillDate, setCalPrefillDate] = useState(null)
  const [shareLink, setShareLink] = useState(null)
  const [deleteLink, setDeleteLink] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [notesLink, setNotesLink] = useState(null)
  const [calImportProvider, setCalImportProvider] = useState(null)
  const [verifyWarning, setVerifyWarning] = useState(false)
  const [resendState, setResendState] = useState('idle') // idle | sending | sent
  const [tzMismatch, setTzMismatch] = useState(null) // { from, to, newOffset } | null
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  useEffect(() => {
    document.documentElement.id = 'links_html'
    return () => { document.documentElement.id = '' }
  }, [])

  useEffect(() => {
    usersApi.me().then(u => { setUser(u); if (u && !u.whats_new_seen) setShowWhatsNew(true) }).catch(() => {})
    if (confirmed) syncTimezone()
    setFetchError(false)
    linksApi.getAll().then(data => {
      if (data['links'] !== undefined) setLinks(data['links'] || [])
      if (data['pending-links'] !== undefined) setPendingLinks(data['pending-links'] || [])
      if (data['deleted-links'] !== undefined) setDeletedLinks(data['deleted-links'] || [])
    }).catch(() => setFetchError(true)).finally(() => setLoading(false))
  }, [])

  async function syncTimezone() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const offsetRaw = new Date().getTimezoneOffset() / 60
    const offset = offsetRaw % 1 === 0 ? `${offsetRaw}.0` : String(offsetRaw)
    try {
      const saved = await usersApi.me()
      if (saved.timezone && saved.timezone !== tz) {
        // IANA timezone changed (traveled / switched system) — ask the user
        setTzMismatch({ from: saved.timezone, to: tz, newOffset: parseFloat(offset) })
        return
      }
      // Same IANA timezone, DST offset shift — update silently
      if (String(saved.offset) !== offset) {
        await usersApi.daylightSavings(parseFloat(offset) - parseFloat(saved.offset || 0))
      }
    } catch {}
  }

  async function handleTzUpdate() {
    try {
      await usersApi.updateTimezone(tzMismatch.to, tzMismatch.newOffset)
    } catch {}
    setTzMismatch(null)
  }

  function handleTzKeep() {
    setTzMismatch(null)
  }

  function fmtTz(tz) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZoneName: 'long', timeZone: tz })
        .formatToParts(new Date())
        .find(p => p.type === 'timeZoneName')?.value ?? tz
    } catch { return tz }
  }

  const handleWsMessage = useCallback((data) => {
    if (data['links'] !== undefined) setLinks(data['links'] || [])
    if (data['pending-links'] !== undefined) setPendingLinks(data['pending-links'] || [])
    if (data['deleted-links'] !== undefined) setDeletedLinks(data['deleted-links'] || [])
  }, [])

  async function refreshLinks() {
    try {
      const data = await linksApi.getAll()
      if (data['links'] !== undefined) setLinks(data['links'] || [])
      if (data['pending-links'] !== undefined) setPendingLinks(data['pending-links'] || [])
      if (data['deleted-links'] !== undefined) setDeletedLinks(data['deleted-links'] || [])
    } catch {}
  }

  useWebSocket(confirmed ? email : null, token, handleWsMessage)
  useAutoOpen(links, user,
    (id) => setLinks(prev => prev.map(l => l.id === id ? { ...l, active: 'false' } : l)),
    (id) => setLinks(prev => prev.filter(l => l.id !== id))
  )

  const filtered = sortLinks(
    links.filter(l => l.name?.toLowerCase().includes(search.toLowerCase())),
    user?.sort
  )

  async function handleResend() {
    if (resendState !== 'idle') return
    setResendState('sending')
    try {
      await authApi.resendConfirmation()
      setResendState('sent')
    } catch {
      setResendState('idle')
    }
  }

  function tryAdd(action) {
    if (!confirmed) { setVerifyWarning(true); return }
    action()
  }

  function handleEdit(link) { setCalPrefillDays(null); setEditLink(link); setShowLinkModal(true) }

  function handleAddForDay(date) {
    if (!confirmed) { setVerifyWarning(true); return }
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    setCalPrefillDays([dow[date.getDay()]])
    setCalPrefillDate(`${m}/${d}/${date.getFullYear()}`)
    setEditLink(null)
    setShowLinkModal(true)
  }
  function handleShare(link) { setShareLink(link) }
  function handleDelete(link) { setDeleteLink(link) }
  function handleNotes(link) { setNotesLink(link) }

  async function handleRestore(linkObj) {
    setDeletedLinks(prev => prev.filter(l => l.id !== linkObj.id))
    try { await linksApi.restore(linkObj.id); refreshLinks() } catch {
      setDeletedLinks(prev => [...prev, linkObj])
    }
  }

  async function permanentDelete(linkObj) {
    setDeletedLinks(prev => prev.filter(l => l.id !== linkObj.id))
    try { await linksApi.delete(linkObj.id, true) } catch {
      setDeletedLinks(prev => [...prev, linkObj])
    }
  }

  const calendarEnabled = !!user?.show_calendar

  return (
    <div id="links-page" className={calendarEnabled ? 'lp-cal-mode' : ''}>
      <div id="blur" style={{ width: '100%', zIndex: showLinkModal || shareLink || deleteLink || showSettings || notesLink || calImportProvider ? 101 : -3, background: 'rgba(0,0,0,0.4)', opacity: showLinkModal || shareLink || deleteLink || showSettings || notesLink || calImportProvider ? 0.4 : 0, height: 'calc(100% + 100px)', position: 'fixed', top: 0, left: 0, transition: '0.25s', pointerEvents: showLinkModal || shareLink || deleteLink || showSettings || notesLink || calImportProvider ? 'auto' : 'none' }} />
      {tzMismatch && (
        <div className="verify-banner tz-banner">
          <span>
            Your timezone changed from <strong>{fmtTz(tzMismatch.from)}</strong> to <strong>{fmtTz(tzMismatch.to)}</strong>. Update your meeting times?
          </span>
          <button className="verify-banner-resend" onClick={handleTzUpdate}>Update</button>
          <button className="verify-banner-resend tz-keep-btn" onClick={handleTzKeep}>Keep {fmtTz(tzMismatch.from)}</button>
        </div>
      )}
      {verifyWarning && (
        <div className="verify-banner">
          <span>Verify your email to add meetings — check your inbox for the confirmation link.</span>
          <button
            className="verify-banner-resend"
            onClick={handleResend}
            disabled={resendState !== 'idle'}
          >
            {resendState === 'sent' ? 'Sent!' : resendState === 'sending' ? 'Sending…' : 'Resend email'}
          </button>
          <button className="verify-banner-close" onClick={() => setVerifyWarning(false)}>✕</button>
        </div>
      )}
      <Header
        onSettings={() => setShowSettings(true)}
        onAdd={() => tryAdd(() => { setEditLink(null); setShowLinkModal(true) })}
        page="links"
      />

      <div className={calendarEnabled ? 'lp-body' : ''}>
        <div className={calendarEnabled ? 'lp-links-col' : ''}>
          <div id="links-search-container">
            <input
              id="links-search"
              placeholder="Search for links"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {pendingLinks.length > 0 && (
            <div id="pending-links">
              <div style={{ fontWeight: 600, fontSize: 18, margin: '20px 0 10px', opacity: 0.7 }}>Pending Invitations</div>
              {pendingLinks.map(l => (
                <LinkCard
                  key={l.id} link={l} isPending
                  onEdit={handleEdit} onShare={handleShare}
                  onDelete={handleDelete} onNotes={handleNotes}
                />
              ))}
              <hr className="hr-pending-links" />
            </div>
          )}

          {loading && (
            <div className="links-skeleton">
              {[0, 1, 2].map(i => (
                <div key={i} className="links-skeleton-card" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}

          {!loading && fetchError && (
            <div className="no-links" style={{ flexDirection: 'column', gap: 12 }}>
              <div>Failed to load. Check your connection and try again.</div>
              <button
                className="modal-action-btn"
                onClick={() => {
                  setLoading(true)
                  setFetchError(false)
                  linksApi.getAll().then(data => {
                    if (data['links'] !== undefined) setLinks(data['links'] || [])
                    if (data['pending-links'] !== undefined) setPendingLinks(data['pending-links'] || [])
                    if (data['deleted-links'] !== undefined) setDeletedLinks(data['deleted-links'] || [])
                  }).catch(() => setFetchError(true)).finally(() => setLoading(false))
                }}
              >Retry</button>
            </div>
          )}

          <div id="insert">
            {links.length === 0 && !search && !loading && !fetchError && (
              <OnboardingCard
                onAddManually={() => tryAdd(() => { setEditLink(null); setShowLinkModal(true) })}
                onImportGoogle={() => tryAdd(() => setCalImportProvider('google'))}
                onImportOutlook={() => tryAdd(() => setCalImportProvider('microsoft'))}
              />
            )}
            {filtered.length === 0 && search && !loading && (
              <div className="no-links" id="no-links-search">
                <img src="/images/no-links-made.svg" alt="No results" />
                <div>No links match your search</div>
                <button className="modal-action-btn" style={{ marginTop: 8 }} onClick={() => setSearch('')}>Clear search</button>
              </div>
            )}
            {(() => {
              const nextId = findNextLinkId(filtered)
              return filtered.map((l, i) => (
                <LinkCard
                  key={l.id} link={l}
                  onEdit={handleEdit} onShare={handleShare}
                  onDelete={handleDelete} onNotes={handleNotes}
                  onToggle={(id, val) => setLinks(prev => prev.map(lk => lk.id === id ? { ...lk, active: val } : lk))}
                  isNext={l.id === nextId}
                />
              ))
            })()}
          </div>
        </div>

        {calendarEnabled && (
          <div className="lp-cal-col">
            <CalendarPanel links={links} onEditLink={handleEdit} onAddForDay={handleAddForDay} />
          </div>
        )}
      </div>

      <img
        src="/images/plus-mobile.svg"
        className="plus"
        alt="Add link"
        onClick={() => tryAdd(() => { setEditLink(null); setShowLinkModal(true) })}
      />

      {calImportProvider && (
        <CalendarImportModal
          provider={calImportProvider}
          existingLinks={links}
          onClose={() => setCalImportProvider(null)}
          onImport={refreshLinks}
        />
      )}

      {showLinkModal && (
        <LinkModal
          visible={showLinkModal}
          editLink={editLink}
          onClose={() => { setShowLinkModal(false); setEditLink(null); setCalPrefillDays(null); setCalPrefillDate(null) }}
          onSuccess={refreshLinks}
          prefillDays={calPrefillDays}
          prefillDate={calPrefillDate}
        />
      )}

      {shareLink && (
        <ShareModal
          link={shareLink}
          type="link"
          onClose={() => setShareLink(null)}
        />
      )}

      {deleteLink && (
        <DeleteModal
          link={deleteLink}
          type="link"
          onClose={(deleted) => {
            if (deleted) setLinks(prev => prev.filter(l => l.id !== deleteLink.id))
            setDeleteLink(null)
          }}
        />
      )}

      {notesLink && (
        <NotesModal
          link={notesLink}
          onClose={() => setNotesLink(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          user={user}
          visible={showSettings}
          onClose={() => { setShowSettings(false); usersApi.me().then(setUser).catch(() => {}) }}
          onShowDeleted={() => setShowDeleted(true)}
          onCalendarImport={() => { setShowSettings(false); setCalImportProvider('google') }}
          onOutlookImport={() => { setShowSettings(false); setCalImportProvider('microsoft') }}
          onUserRefresh={() => usersApi.me().then(setUser).catch(() => {})}
        />
      )}

      {showWhatsNew && !loading && (
        <WhatsNewModal onClose={() => setShowWhatsNew(false)} />
      )}

      {showDeleted && (
        <div className="modal-overlay" onClick={() => setShowDeleted(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <img src="/images/arrow-left.svg" className="modal-back" alt="back" onClick={() => setShowDeleted(false)} />
            <div className="modal-title">Deleted Links</div>
            {deletedLinks.length === 0 ? (
              <div className="modal-deleted-empty">
                <img src="/images/no-links-made.svg" alt="Empty trash" />
                <div>No deleted links</div>
              </div>
            ) : (
              <div className="modal-deleted-list">
                {deletedLinks.map(l => (
                  <div key={l.id} className="modal-deleted-row">
                    <div className="modal-deleted-name">{l.name}</div>
                    <div className="modal-deleted-actions">
                      <button className="modal-action-btn" onClick={() => handleRestore(l)}>Restore</button>
                      <button className="modal-action-btn modal-action-btn-danger" onClick={() => permanentDelete(l)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
