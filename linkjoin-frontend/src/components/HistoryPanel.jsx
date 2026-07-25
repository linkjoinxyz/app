import { useState, useEffect, useMemo } from 'react'
import { linksApi } from '../api/links.js'
import '../styles/settings.css'

const myEmail = () => localStorage.getItem('lj_email') || ''

const EVENT_META = {
  open:    { label: 'Opened',   dot: 'var(--c-accent-550)' },
  create:  { label: 'Added',    dot: 'var(--c-success-400)' },
  edit:    { label: 'Edited',   dot: 'rgba(255,255,255,0.35)' },
  delete:  { label: 'Deleted',  dot: 'var(--c-danger-400)' },
  restore: { label: 'Restored', dot: 'var(--c-amber-400)' },
  toggle:  { label: 'Toggled',  dot: 'rgba(255,255,255,0.35)' },
}

function formatTs(iso) {
  const d = new Date(iso)
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayMidnight = new Date(todayMidnight - 86400000)
  const weekAgo = new Date(todayMidnight - 6 * 86400000)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (d >= todayMidnight) return `Today ${time}`
  if (d >= yesterdayMidnight) return `Yesterday ${time}`
  if (d >= weekAgo) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`
}

function userPrefix(email) {
  if (!email) return ''
  return email.split('@')[0]
}

function exportCsv(rows, showMeeting, isAdminView, filename) {
  const headers = ['Time', 'Event', ...(showMeeting ? ['Meeting'] : []), ...(isAdminView ? ['User'] : [])]
  const dataRows = rows.map(ev => {
    const meta = EVENT_META[ev.type] || EVENT_META.edit
    return [
      formatTs(ev.ts),
      meta.label,
      ...(showMeeting ? [ev.link_name || 'Untitled'] : []),
      ...(isAdminView ? [ev.actor || ''] : []),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`)
  })
  const csv = [headers.map(h => `"${h}"`), ...dataRows].map(r => r.join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export { exportCsv, EVENT_META, formatTs, userPrefix, myEmail }

export default function HistoryPanel({ linkId = null, linkName = null }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextBefore, setNextBefore] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    setEvents([])
    linksApi.getHistory(50, linkId, null)
      .then(r => {
        setEvents(r.events || [])
        setHasMore(r.has_more || false)
        setNextBefore(r.next_before || null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [linkId])

  async function loadMore() {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await linksApi.getHistory(50, linkId, nextBefore)
      setEvents(prev => [...prev, ...(r.events || [])])
      setHasMore(r.has_more || false)
      setNextBefore(r.next_before || null)
    } catch {}
    setLoadingMore(false)
  }

  const isAdminView = useMemo(
    () => events.some(e => e.actor && e.actor !== myEmail()),
    [events]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return events.filter(ev => {
      const matchSearch = !q ||
        ev.link_name?.toLowerCase().includes(q) ||
        ev.actor?.toLowerCase().includes(q)
      const matchType =
        typeFilter === 'all' ||
        (typeFilter === 'open' && ev.type === 'open') ||
        (typeFilter === 'change' && ev.type !== 'open')
      return matchSearch && matchType
    })
  }, [events, search, typeFilter])

  const showMeeting = !linkId
  const csvFilename = linkName
    ? `${linkName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-history.csv`
    : 'linkjoin-history.csv'

  return (
    <div className="history-panel">
      <div className="history-panel-inner">
        <div className="history-toolbar">
          <input
            className="history-search"
            type="text"
            placeholder="Search meetings, users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="history-type-filter"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="all">All events</option>
            <option value="open">Opens only</option>
            <option value="change">Changes only</option>
          </select>
          <button
            className="history-export-btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => exportCsv(filtered, showMeeting, isAdminView, csvFilename)}
            disabled={filtered.length === 0}
          >
            Export CSV
          </button>
        </div>

        {loading ? (
          <div className="history-empty">Loading…</div>
        ) : events.length === 0 ? (
          <div className="history-empty">No history yet. Auto-opens and changes will appear here.</div>
        ) : filtered.length === 0 ? (
          <div className="history-empty">No matching events.</div>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th className="col-time">Time</th>
                <th className="col-event">Event</th>
                {showMeeting && <th className="col-meeting">Meeting</th>}
                {isAdminView && <th className="col-user">User</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev, i) => {
                const meta = EVENT_META[ev.type] || EVENT_META.edit
                return (
                  <tr key={i}>
                    <td className="col-time">{formatTs(ev.ts)}</td>
                    <td className="col-event">
                      <span className="history-dot" style={{ background: meta.dot }} />
                      {meta.label}
                    </td>
                    {showMeeting && <td className="col-meeting">{ev.link_name || 'Untitled'}</td>}
                    {isAdminView && <td className="col-user">{userPrefix(ev.actor)}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {hasMore && (
        <div style={{ padding: '0 24px 20px' }}>
          <button
            className="history-load-more"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
