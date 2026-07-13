import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../api/client.js'
import { usersApi } from '../api/users.js'
import SideNav from '../components/SideNav.jsx'
import '../styles/parent-portal.css'
import '../styles/globals.css'

const FLAG_LABELS = {
  low_attendance: 'Low attendance',
  repeat_tardy: 'Repeat tardy',
}

function formatTime12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function AttendanceBadge({ rate, flag }) {
  if (rate === null || rate === undefined) return <span className="pp-badge pp-badge--neutral">No data</span>
  const pct = Math.round(rate * 100)
  const cls = flag ? 'pp-badge--warn' : pct >= 90 ? 'pp-badge--good' : pct >= 70 ? 'pp-badge--ok' : 'pp-badge--warn'
  return <span className={`pp-badge ${cls}`}>{pct}% present</span>
}

function ChildCard({ student, selected, onSelect }) {
  const name = student.first_name
    ? `${student.first_name} ${student.last_name || ''}`.trim()
    : (student.name || student.username)
  return (
    <button
      className={`pp-child-card${selected ? ' pp-child-card--active' : ''}`}
      onClick={onSelect}
    >
      <div className="pp-child-avatar">{name.charAt(0).toUpperCase()}</div>
      <div className="pp-child-info">
        <div className="pp-child-name">{name}</div>
        <div className="pp-child-email">{student.username}</div>
      </div>
    </button>
  )
}

function ClassesTab({ student }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    setLoading(true)
    apiGet(`/parent/children/${student.user_id}/classes`)
      .then(data => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setClasses([]))
      .finally(() => setLoading(false))
  }, [student.user_id])

  if (loading) return <div className="pp-loading">Loading classes...</div>
  if (!classes.length) return <div className="pp-empty">No classes found for this student.</div>

  return (
    <div className="pp-classes">
      {classes.map(cls => {
        const isExpanded = expanded === cls.class_id
        const attendancePct = cls.attendance_rate !== null ? Math.round(cls.attendance_rate * 100) : null
        const scheduleLabel = [
          formatTime12(cls.time),
          cls.days?.length > 0 ? cls.days.join(', ') : '',
        ].filter(Boolean).join(' · ')

        return (
          <div key={cls.class_id} className="pp-class-card">
            <button
              className="pp-class-header"
              onClick={() => setExpanded(isExpanded ? null : cls.class_id)}
            >
              <div className="pp-class-header-left">
                <span className="pp-class-name">{cls.class_name}</span>
                {scheduleLabel && <span className="pp-class-days">{scheduleLabel}</span>}
                {cls.teacher_name && <span className="pp-class-teacher">{cls.teacher_name}</span>}
              </div>
              <div className="pp-class-header-right">
                <AttendanceBadge rate={cls.attendance_rate} flag={cls.active_flag} />
                <span className="pp-chevron">{isExpanded ? '▾' : '▸'}</span>
              </div>
            </button>
            {isExpanded && (
              <div className="pp-class-detail">
                <div className="pp-class-stats">
                  <div className="pp-stat">
                    <span className="pp-stat-val">{cls.attended_last_28d}</span>
                    <span className="pp-stat-label">Sessions attended (28 days)</span>
                  </div>
                  {cls.expected_last_28d !== null && (
                    <div className="pp-stat">
                      <span className="pp-stat-val">{cls.expected_last_28d}</span>
                      <span className="pp-stat-label">Expected sessions</span>
                    </div>
                  )}
                  {attendancePct !== null && (
                    <div className="pp-stat">
                      <span className={`pp-stat-val${attendancePct < 70 ? ' pp-stat-val--warn' : ''}`}>{attendancePct}%</span>
                      <span className="pp-stat-label">Attendance rate</span>
                    </div>
                  )}
                  <div className="pp-stat">
                    <span className={`pp-stat-val${cls.tardy_last_28d > 2 ? ' pp-stat-val--warn' : ''}`}>{cls.tardy_last_28d}</span>
                    <span className="pp-stat-label">Times tardy (28 days)</span>
                  </div>
                </div>
                {(cls.teacher_name || cls.teacher_email) && (
                  <div className="pp-teacher-info">
                    <span className="pp-teacher-label">Teacher</span>
                    <span className="pp-teacher-name">{cls.teacher_name || cls.teacher_email}</span>
                    {cls.teacher_email && (
                      <a className="pp-teacher-email" href={`mailto:${cls.teacher_email}`}>{cls.teacher_email}</a>
                    )}
                  </div>
                )}
                {cls.active_flag && (
                  <div className="pp-flag-notice">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span>A {FLAG_LABELS[cls.active_flag]?.toLowerCase()} concern has been noted by the school. If you have questions, please contact the teacher.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function NoteModal({ event, studentId, onClose, onSaved }) {
  const [noteText, setNoteText] = useState(event.parent_note?.note ?? '')
  const [isExcuse, setIsExcuse] = useState(event.parent_note?.is_excuse ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!noteText.trim()) return
    setSaving(true)
    setError('')
    try {
      await apiPost('/parent/notes', {
        student_user_id: studentId,
        class_id: event.class_id,
        class_name: event.class_name,
        date: event.date,
        note: noteText.trim(),
        is_excuse: isExcuse,
      })
      onSaved({ note: noteText.trim(), is_excuse: isExcuse, submitted_at: new Date().toISOString() })
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pp-modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="pp-modal">
        <div className="pp-modal-title">
          {event.parent_note ? 'Edit note' : 'Add note'}
        </div>
        <div className="pp-modal-subtitle">
          {event.class_name} · {formatDate(event.date)}
          {event.type === 'absent' && ' · Absent'}
          {event.type === 'tardy' && ` · ${event.minutes_late}m late`}
        </div>
        <textarea
          className="pp-modal-textarea"
          placeholder="E.g. Emma was home sick with a fever."
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          autoFocus
        />
        <label className="pp-modal-excuse-row" onClick={() => setIsExcuse(v => !v)}>
          <span className={`pp-modal-checkbox${isExcuse ? ' pp-modal-checkbox--checked' : ''}`}>
            {isExcuse && <img src="/images/check.svg" alt="" className="pp-modal-check-img" />}
          </span>
          <span className="pp-modal-excuse-label">Mark as excused</span>
        </label>
        {error && <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>}
        <div className="pp-modal-actions">
          <button className="pp-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="pp-modal-save" onClick={handleSave} disabled={saving || !noteText.trim()}>
            {saving ? 'Saving...' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  )
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function AttendanceTab({ student }) {
  const [allEvents, setAllEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [noteTarget, setNoteTarget] = useState(null)
  const [filterClass, setFilterClass] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterDay, setFilterDay] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    setLoading(true)
    apiGet(`/parent/children/${student.user_id}/attendance?limit=1000&offset=0`)
      .then(data => setAllEvents(data.events ?? []))
      .catch(() => setAllEvents([]))
      .finally(() => setLoading(false))
  }, [student.user_id])

  function handleNoteSaved(note) {
    setAllEvents(evs => evs.map(e =>
      e.class_id === noteTarget.class_id && e.date === noteTarget.date
        ? { ...e, parent_note: note }
        : e
    ))
  }

  const classes = [...new Set(allEvents.map(e => e.class_name))].sort()
  const years = [...new Set(allEvents.map(e => e.date.slice(0, 4)))].sort().reverse()
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1))

  const filtered = allEvents.filter(e => {
    const [y, m, d] = e.date.split('-')
    if (filterClass && e.class_name !== filterClass) return false
    if (filterYear && y !== filterYear) return false
    if (filterMonth && Number(m) !== MONTHS.indexOf(filterMonth) + 1) return false
    if (filterDay && Number(d) !== Number(filterDay)) return false
    if (filterStatus && e.type !== filterStatus) return false
    return true
  })

  const hasFilters = filterClass || filterMonth || filterDay || filterYear || filterStatus

  return (
    <>
      {noteTarget && (
        <NoteModal
          event={noteTarget}
          studentId={student.user_id}
          onClose={() => setNoteTarget(null)}
          onSaved={handleNoteSaved}
        />
      )}
      <div className="pp-att-filters">
        <label className="pp-att-filter-group">
          <span className="pp-att-filter-label">Class</span>
          <select className="pp-att-filter" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">All</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="pp-att-filter-group">
          <span className="pp-att-filter-label">Month</span>
          <select className="pp-att-filter" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">All</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="pp-att-filter-group">
          <span className="pp-att-filter-label">Day</span>
          <select className="pp-att-filter" value={filterDay} onChange={e => setFilterDay(e.target.value)}>
            <option value="">All</option>
            {days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="pp-att-filter-group">
          <span className="pp-att-filter-label">Year</span>
          <select className="pp-att-filter" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="pp-att-filter-group">
          <span className="pp-att-filter-label">Status</span>
          <select className="pp-att-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option value="on_time">On time</option>
            <option value="tardy">Tardy</option>
            <option value="absent">Absent</option>
          </select>
        </label>
        {hasFilters && (
          <button className="pp-att-filter-clear" onClick={() => { setFilterClass(''); setFilterMonth(''); setFilterDay(''); setFilterYear(''); setFilterStatus('') }}>
            Clear
          </button>
        )}
      </div>
      {loading ? (
        <div className="pp-loading">Loading attendance...</div>
      ) : !filtered.length ? (
        <div className="pp-empty">No sessions found.</div>
      ) : (
        <div className="pp-attendance">
          <table className="pp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Status</th>
                <th>Parent note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev, i) => (
                <tr key={i} className={`pp-row-${ev.type}`}>
                  <td className="pp-dim">{formatDate(ev.date)}</td>
                  <td>{ev.class_name}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {ev.type === 'on_time' && <span className="pp-badge pp-badge--good">On time</span>}
                      {ev.type === 'tardy' && <span className="pp-badge pp-badge--ok">{ev.minutes_late}m late</span>}
                      {ev.type === 'absent' && <span className="pp-badge pp-badge--warn">Absent</span>}
                      {ev.parent_note?.is_excuse && <span className="pp-note-excuse-tag">Excused</span>}
                    </div>
                  </td>
                  <td>
                    {ev.parent_note ? (
                      <div className="pp-note-cell">
                        <span className="pp-note-preview">{ev.parent_note.note}</span>
                        <button className="pp-note-btn pp-note-btn--has-note" onClick={() => setNoteTarget(ev)}>Edit</button>
                      </div>
                    ) : (
                      <button className="pp-note-btn" onClick={() => setNoteTarget(ev)}>Add note</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function ParentPortal() {
  const { role, token, onboardingDone, markOnboardingDone } = useAuth()
  const navigate = useNavigate()
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedChild, setSelectedChild] = useState(null)
  const [tab, setTab] = useState('classes')
  const [welcomeDismissed, setWelcomeDismissed] = useState(onboardingDone)

  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = 'var(--blue, #142539)'
    return () => { document.body.style.background = prev }
  }, [])

  async function dismissWelcome() {
    setWelcomeDismissed(true)
    markOnboardingDone()
    try { await usersApi.completeOnboarding() } catch {}
  }

  useEffect(() => {
    if (!token) { navigate('/login'); return }
    if (role && role !== 'parent') { navigate('/meetings'); return }
  }, [token, role, navigate])

  useEffect(() => {
    if (!token) return
    apiGet('/parent/children')
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setChildren(list)
        if (list.length > 0) setSelectedChild(list[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="pp-root" style={{ display: 'flex' }}>
      <SideNav page="parent" />
      <div className="sn-content pp-page">
        <div className="pp-header">
          <div className="pp-header-title">Parent Portal</div>
          <div className="pp-header-sub">View your children's classes and attendance, and leave notes on absences or tardies</div>
        </div>

        {!welcomeDismissed && (
          <div className="pp-welcome-banner">
            <div className="pp-welcome-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="pp-welcome-text">
              <div className="pp-welcome-title">Welcome to the Parent Portal</div>
              <div className="pp-welcome-desc">
                View your children's class schedules and attendance. You can also leave notes on absences or tardies that will be visible to the school. If you don't see your children listed, contact your school administrator.
              </div>
            </div>
            <button className="pp-welcome-close" onClick={dismissWelcome} aria-label="Dismiss welcome message">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {loading ? (
          <div className="pp-loading">Loading...</div>
        ) : children.length === 0 ? (
          <div className="pp-empty-state">
            <div className="pp-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="pp-empty-title">No children linked</div>
            <div className="pp-empty-desc">Your account has not been linked to any student accounts. Please contact your school administrator.</div>
          </div>
        ) : (
          <div className="pp-layout">
            <div className="pp-sidebar">
              <div className="pp-sidebar-label">Children</div>
              {children.map(child => (
                <ChildCard
                  key={child.user_id}
                  student={child}
                  selected={selectedChild?.user_id === child.user_id}
                  onSelect={() => { setSelectedChild(child); setTab('classes') }}
                />
              ))}
            </div>

            {selectedChild && (
              <div className="pp-content">
                <div className="pp-content-header">
                  <div className="pp-content-name">
                    {selectedChild.first_name
                      ? `${selectedChild.first_name} ${selectedChild.last_name || ''}`.trim()
                      : (selectedChild.name || selectedChild.username)}
                  </div>
                  <div className="pp-content-email">{selectedChild.username}</div>
                </div>
                <div className="admin-tabs" style={{ marginBottom: 20 }}>
                  <button className={`admin-tab${tab === 'classes' ? ' admin-tab--active' : ''}`} onClick={() => setTab('classes')}>Classes</button>
                  <button className={`admin-tab${tab === 'attendance' ? ' admin-tab--active' : ''}`} onClick={() => setTab('attendance')}>Attendance</button>
                </div>
                {tab === 'classes' && <ClassesTab student={selectedChild} />}
                {tab === 'attendance' && <AttendanceTab student={selectedChild} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
