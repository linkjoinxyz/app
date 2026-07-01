import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost, apiDelete, apiPatch, apiDownload } from '../api/client.js'
import HeaderModern from '../components/HeaderModern.jsx'
import LinkModal from '../components/LinkModal.jsx'
import '../styles/admin.css'

// ─── helpers ────────────────────────────────────────────────────────────────


function formatTime(t) {
  if (!t) return ''
  if (/[AP]M/i.test(t)) return t
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return t
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

const AVATAR_PALETTES = [
  { bg: 'rgba(43,143,216,0.22)', border: 'rgba(43,143,216,0.5)' },
  { bg: 'rgba(72,197,120,0.2)',  border: 'rgba(72,197,120,0.45)' },
  { bg: 'rgba(255,160,50,0.2)',  border: 'rgba(255,160,50,0.45)' },
  { bg: 'rgba(180,100,220,0.2)', border: 'rgba(180,100,220,0.45)' },
  { bg: 'rgba(50,180,180,0.2)',  border: 'rgba(50,180,180,0.45)' },
]

function avatarPalette(email) {
  return AVATAR_PALETTES[(email || '?').charCodeAt(0) % AVATAR_PALETTES.length]
}

function DayBadge({ day }) {
  return (
    <span style={{
      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 4, padding: '1px 6px', fontSize: 11, color: 'rgba(255,255,255,0.65)',
    }}>{day}</span>
  )
}

// ─── Class Detail (teacher view) ─────────────────────────────────────────────

function ClassDetail({ cls, onBack, onUpdate }) {
  const [students, setStudents] = useState([])
  const [allLinks, setAllLinks] = useState([])
  const [classLinks, setClassLinks] = useState([])
  const [attendance, setAttendance] = useState([])
  const [patterns, setPatterns] = useState(null)
  const [addInput, setAddInput] = useState('')
  const [addErr, setAddErr] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([
      apiGet(`/classes/${cls.class_id}`),
      apiGet('/links'),
      apiGet(`/attendance/class/${cls.class_id}`).catch(() => ({ records: [] })),
      apiGet(`/attendance/class/${cls.class_id}/patterns`).catch(() => null),
    ]).then(([fresh, linksRes, attRes, patternsRes]) => {
      setStudents(fresh.students || [])
      const links = linksRes.links || []
      setAllLinks(links)
      setClassLinks(links.filter(l => (fresh.link_ids || []).includes(l.id)))
      setAttendance(attRes.records || [])
      setPatterns(patternsRes)
      onUpdate(fresh)
    }).catch(() => {})
  }, [cls.class_id])

  async function handleAddStudent() {
    const uid = addInput.trim()
    if (!uid) return
    setAddLoading(true)
    setAddErr('')
    try {
      await apiPost(`/classes/${cls.class_id}/students`, { student_ids: [uid] })
      const fresh = await apiGet(`/classes/${cls.class_id}`)
      setStudents(fresh.students || [])
      setAddInput('')
      onUpdate(fresh)
    } catch (e) {
      setAddErr(e.body?.detail || 'Failed to add student')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleRemoveStudent(userId) {
    try {
      await apiDelete(`/classes/${cls.class_id}/students/${userId}`)
      setStudents(prev => prev.filter(s => s.user_id !== userId))
    } catch (e) {
      console.error(e)
    }
  }

  async function handleLinkCreated(newId) {
    if (!newId) return
    try {
      await apiPost(`/classes/${cls.class_id}/links/${newId}`)
      const [fresh, linksRes] = await Promise.all([
        apiGet(`/classes/${cls.class_id}`),
        apiGet('/links'),
      ])
      const links = linksRes.links || []
      setAllLinks(links)
      setClassLinks(links.filter(l => (fresh.link_ids || []).includes(l.id)))
      onUpdate(fresh)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleLinkEdited() {
    try {
      const [fresh, linksRes] = await Promise.all([
        apiGet(`/classes/${cls.class_id}`),
        apiGet('/links'),
      ])
      const links = linksRes.links || []
      setAllLinks(links)
      setClassLinks(links.filter(l => (fresh.link_ids || []).includes(l.id)))
      onUpdate(fresh)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleExportCsv() {
    setExporting(true)
    try {
      await apiDownload(`/attendance/class/${cls.class_id}/export`, `${cls.name}-attendance.csv`)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  async function handleRemoveLink(linkId) {
    try {
      await apiDelete(`/classes/${cls.class_id}/links/${linkId}`)
      setClassLinks(prev => prev.filter(l => l.id !== linkId))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="detail-root">
      {/* Hero header — mirrors link card layout */}
      <div className="detail-hero">
        <button className="detail-back-btn" onClick={onBack}>
          <img src="/images/arrow-left.svg" alt="back" style={{ width: 18, height: 18, display: 'block' }} />
        </button>
        {cls.time && <div className="detail-time-pill">{formatTime(cls.time)}</div>}
        <div className="detail-class-name">{cls.name}</div>
        {cls.days?.length > 0 && (
          <div className="detail-days-str">
            {cls.days.join(' · ')}
          </div>
        )}
      </div>

      {/* Section grid */}
      <div className="detail-sections">

        {/* Links section */}
        <div className="detail-section-card">
          <div className="detail-section-header">
            <span className="detail-section-label">Links</span>
            <span className="detail-section-count">{classLinks.length}</span>
            <button className="detail-section-add-btn" onClick={() => { setEditingLink(null); setShowLinkModal(true) }}>
              + Add
            </button>
          </div>
          <div className="detail-section-body">
            {classLinks.length > 0 ? (
              <div className="class-links-list">
                {classLinks.map(l => (
                  <div key={l.id} className="class-link-pill" onClick={() => { setEditingLink(l); setShowLinkModal(true) }}>
                    <span>{l.name}</span>
                    <button onClick={e => { e.stopPropagation(); handleRemoveLink(l.id) }}>&#x2715;</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-empty">No links assigned yet.</div>
            )}
          </div>
        </div>

        {showLinkModal && (
          <LinkModal
            visible={showLinkModal}
            editLink={editingLink}
            onClose={() => { setShowLinkModal(false); setEditingLink(null) }}
            onSuccess={editingLink ? handleLinkEdited : handleLinkCreated}
            defaultAutoOpen={false}
          />
        )}

        {/* Students section */}
        <div className="detail-section-card">
          <div className="detail-section-header">
            <span className="detail-section-label">Students</span>
            <span className="detail-section-count">{students.length}</span>
          </div>
          <div className="detail-section-body">
            <div className="admin-add-row">
              <input className="admin-input" value={addInput}
                onChange={e => setAddInput(e.target.value)}
                placeholder="Student email"
                onKeyDown={e => e.key === 'Enter' && handleAddStudent()} />
              <button className="admin-btn" onClick={handleAddStudent}
                disabled={addLoading || !addInput.trim()}>
                {addLoading ? '...' : 'Add'}
              </button>
            </div>
            {addErr && <div className="admin-error">{addErr}</div>}
            {students.length > 0 ? (
              <table className="roster-table">
                <thead>
                  <tr><th>Email</th><th></th></tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.user_id}>
                      <td>{s.username}</td>
                      <td>
                        <button className="roster-remove-btn" onClick={() => handleRemoveStudent(s.user_id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="admin-empty">No students enrolled yet.</div>
            )}
          </div>
        </div>

        {/* Attendance section */}
        <div className="detail-section-card detail-section-card--full">
          <div className="detail-section-header">
            <span className="detail-section-label">Attendance</span>
            <span className="detail-section-count">{attendance.length}</span>
            <button
              className="detail-export-btn"
              onClick={handleExportCsv}
              disabled={exporting}
              title="Export CSV"
            >
              {exporting ? 'Exporting…' : '↓ Export CSV'}
            </button>
          </div>
          <div className="detail-section-body">
            {attendance.length > 0 ? (
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Opened</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((r, i) => {
                    const dt = new Date(r.opened_at)
                    const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    const timeStr = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                    const late = r.minutes_late
                    let statusLabel, statusClass
                    if (late <= 1) {
                      statusLabel = late < -1 ? `${Math.abs(late)}m early` : 'On time'
                      statusClass = 'att-on-time'
                    } else if (late <= 5) {
                      statusLabel = `${late}m late`
                      statusClass = 'att-slightly-late'
                    } else {
                      statusLabel = `${late}m late`
                      statusClass = 'att-late'
                    }
                    return (
                      <tr key={i}>
                        <td className="att-email">{r.student_email}</td>
                        <td className="att-time">{dateStr} {timeStr}</td>
                        <td><span className={`att-badge ${statusClass}`}>{statusLabel}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="admin-empty">No attendance recorded yet. Records appear when students' meetings auto-open.</div>
            )}
          </div>
        </div>

        {/* Patterns section */}
        {patterns && (
          <div className="detail-section-card detail-section-card--full">
            <div className="detail-section-header">
              <span className="detail-section-label">Patterns</span>
              {patterns.students.filter(s => s.flags.length > 0).length > 0 && (
                <span className="att-flag-count">
                  {patterns.students.filter(s => s.flags.length > 0).length} flagged
                </span>
              )}
              <span className="detail-section-meta">Last {patterns.lookback_days} days · {patterns.expected_count} expected sessions</span>
            </div>
            <div className="detail-section-body">
              {patterns.students.length === 0 ? (
                <div className="admin-empty">No student data yet for this class.</div>
              ) : (
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Attendance</th>
                      <th>On time</th>
                      <th>Tardy</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patterns.students.map((s, i) => {
                      const pct = Math.round(s.attendance_rate * 100)
                      const hasFlags = s.flags.length > 0
                      return (
                        <tr key={i} className={hasFlags ? 'pattern-row--flagged' : ''}>
                          <td className="att-email">{s.student_email}</td>
                          <td>
                            <div className="att-rate-bar">
                              <div className="att-rate-fill" style={{ width: `${pct}%`, background: pct >= 80 ? '#48c578' : pct >= 50 ? '#f0c040' : '#ff6b6b' }} />
                            </div>
                            <span className="att-rate-label">{s.sessions}/{patterns.expected_count}</span>
                          </td>
                          <td className="att-stat-cell">{s.on_time}</td>
                          <td className="att-stat-cell">{s.tardy > 0 ? <span style={{ color: s.tardy / (s.sessions || 1) >= 0.33 ? '#ff6b6b' : '#f0c040' }}>{s.tardy}</span> : '—'}</td>
                          <td>
                            {s.flags.length > 0 ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {s.flags.map(f => (
                                  <span key={f} className={`att-badge ${f === 'repeat_tardy' ? 'att-late' : 'att-slightly-late'}`}>
                                    {f === 'repeat_tardy' ? 'Repeat tardy' : 'Low attendance'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Teacher View ─────────────────────────────────────────────────────────────

function TeacherView() {
  const [classes, setClasses] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/classes').then(cls => setClasses(cls)).finally(() => setLoading(false))
  }, [])

  function handleUpdate(fresh) {
    setClasses(prev => prev.map(c => c.class_id === fresh.class_id ? fresh : c))
    if (selected?.class_id === fresh.class_id) setSelected(fresh)
  }

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 40 }}>Loading...</div>

  if (selected) {
    return (
      <ClassDetail
        cls={selected}
        onBack={() => setSelected(null)}
        onUpdate={handleUpdate}
      />
    )
  }

  return (
    <>
      <div className="admin-section-title">My Classes</div>
      <div className="class-grid">
        {classes.map(cls => (
          <div key={cls.class_id} className="class-card" onClick={() => setSelected(cls)}>
            {(cls.time || cls.days?.length > 0) && (
              <div className="class-card-header">
                {cls.time && <span className="class-card-time">{formatTime(cls.time)}</span>}
                {cls.days?.length > 0 && (
                  <div className="class-card-days">
                    {cls.days.map(d => <DayBadge key={d} day={d} />)}
                  </div>
                )}
              </div>
            )}
            <div className="class-card-body">
              <div className="class-card-name">{cls.name}</div>
              <div className="class-card-stats">
                <div className="class-card-stat"><span>{(cls.student_ids || []).length}</span> students</div>
                <div className="class-card-stat"><span>{(cls.link_ids || []).length}</span> links</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── School Admin View ────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const DEFAULT_THRESHOLDS = {
  tardy_threshold_minutes: 5,
  tardy_rate_flag: 33,
  attendance_rate_flag: 50,
  min_sessions_to_flag: 3,
}

function AlertSettingsCard({ orgId }) {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(DEFAULT_THRESHOLDS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!orgId) return
    apiGet(`/orgs/${orgId}/attendance-settings`).then(s => {
      const normalized = {
        tardy_threshold_minutes: s.tardy_threshold_minutes,
        tardy_rate_flag: Math.round(s.tardy_rate_flag * 100),
        attendance_rate_flag: Math.round(s.attendance_rate_flag * 100),
        min_sessions_to_flag: s.min_sessions_to_flag,
      }
      setSettings(normalized)
      setDraft(normalized)
    }).catch(() => {})
  }, [orgId])

  function handleChange(key, value) {
    setDraft(d => ({ ...d, [key]: value }))
    setSaved(false)
    setSaveError(null)
  }

  async function handleSave() {
    const tardyMin = Number(draft.tardy_threshold_minutes)
    const tardyRate = Number(draft.tardy_rate_flag)
    const attRate = Number(draft.attendance_rate_flag)
    const minSess = Number(draft.min_sessions_to_flag)
    if (tardyMin < 0 || tardyMin > 60) return setSaveError('Minutes late must be between 0 and 60.')
    if (tardyRate < 1 || tardyRate > 100) return setSaveError('Tardy rate must be between 1% and 100%.')
    if (attRate < 1 || attRate > 100) return setSaveError('Attendance rate must be between 1% and 100%.')
    if (minSess < 1 || minSess > 20) return setSaveError('Minimum sessions must be between 1 and 20.')

    setSaving(true)
    setSaveError(null)
    try {
      await apiPatch(`/orgs/${orgId}/attendance-settings`, {
        tardy_threshold_minutes: Number(draft.tardy_threshold_minutes),
        tardy_rate_flag: Number(draft.tardy_rate_flag) / 100,
        attendance_rate_flag: Number(draft.attendance_rate_flag) / 100,
        min_sessions_to_flag: Number(draft.min_sessions_to_flag),
      })
      setSettings(draft)
      setSaved(true)
    } catch (err) {
      const msg = err?.detail || err?.message || 'Save failed'
      setSaveError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setSaving(false)
    }
  }

  const dirty = settings && (
    draft.tardy_threshold_minutes !== settings.tardy_threshold_minutes ||
    draft.tardy_rate_flag !== settings.tardy_rate_flag ||
    draft.attendance_rate_flag !== settings.attendance_rate_flag ||
    draft.min_sessions_to_flag !== settings.min_sessions_to_flag
  )

  return (
    <div className="alert-settings-card">
      <button className="alert-settings-toggle" onClick={() => setOpen(o => !o)}>
        <span>Alert Settings</span>
        <span className="alert-settings-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="alert-settings-body">
          <div className="alert-settings-grid">
            <label className="alert-settings-label">
              Minutes late to count as tardy
              <input
                type="number"
                className="alert-settings-input"
                min={0} max={60}
                value={draft.tardy_threshold_minutes}
                onChange={e => handleChange('tardy_threshold_minutes', e.target.value)}
              />
            </label>
            <label className="alert-settings-label">
              Flag when tardy rate exceeds (%)
              <input
                type="number"
                className="alert-settings-input"
                min={1} max={100}
                value={draft.tardy_rate_flag}
                onChange={e => handleChange('tardy_rate_flag', e.target.value)}
              />
            </label>
            <label className="alert-settings-label">
              Flag when attendance falls below (%)
              <input
                type="number"
                className="alert-settings-input"
                min={1} max={100}
                value={draft.attendance_rate_flag}
                onChange={e => handleChange('attendance_rate_flag', e.target.value)}
              />
            </label>
            <label className="alert-settings-label">
              Minimum sessions before flagging
              <input
                type="number"
                className="alert-settings-input"
                min={1} max={20}
                value={draft.min_sessions_to_flag}
                onChange={e => handleChange('min_sessions_to_flag', e.target.value)}
              />
            </label>
          </div>
          <div className="alert-settings-footer">
            {saveError && <span className="alert-settings-error">{saveError}</span>}
            {saved && !dirty && !saveError && <span className="alert-settings-saved">Saved</span>}
            <button
              className="admin-btn"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AcademicCalendarCard({ orgId }) {
  const [dates, setDates] = useState([])
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!orgId || !open) return
    apiGet(`/orgs/${orgId}/calendar`).then(r => setDates(r.blackout_dates || [])).catch(() => {})
  }, [orgId, open])

  async function handleAdd() {
    if (!input) return
    setAdding(true)
    setErr('')
    try {
      await apiPost(`/orgs/${orgId}/calendar/blackout`, { date: input })
      setDates(prev => [...prev, input].sort())
      setInput('')
    } catch (e) {
      setErr(e.message || 'Failed to add date')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(date) {
    try {
      await apiDelete(`/orgs/${orgId}/calendar/blackout/${date}`)
      setDates(prev => prev.filter(d => d !== date))
    } catch (e) {
      setErr(e.message || 'Failed to remove date')
    }
  }

  // Group dates by "Month Year"
  const grouped = {}
  for (const d of dates) {
    const dt = new Date(d + 'T12:00:00')
    const label = dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(d)
  }

  return (
    <div className="alert-settings-card">
      <button className="alert-settings-toggle" onClick={() => setOpen(o => !o)}>
        <span>Academic Calendar</span>
        {dates.length > 0 && <span className="cal-badge">{dates.length} day{dates.length !== 1 ? 's' : ''} off</span>}
        <span className="alert-settings-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="alert-settings-body">
          <div className="cal-desc">
            Mark school holidays and snow days. These dates are excluded from expected attendance counts so absent students aren't flagged for days school wasn't in session.
          </div>
          <div className="cal-add-row">
            <input
              type="date"
              className="alert-settings-input cal-date-input"
              value={input}
              onChange={e => { setInput(e.target.value); setErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button className="admin-btn" onClick={handleAdd} disabled={adding || !input}>
              {adding ? '…' : 'Add'}
            </button>
          </div>
          {err && <div className="alert-settings-error" style={{ marginBottom: 8 }}>{err}</div>}
          {dates.length === 0 ? (
            <div className="admin-empty" style={{ marginTop: 8 }}>No blackout dates set.</div>
          ) : (
            <div className="cal-date-list">
              {Object.entries(grouped).map(([month, ds]) => (
                <div key={month} className="cal-month-group">
                  <div className="cal-month-label">{month}</div>
                  {ds.map(d => {
                    const dt = new Date(d + 'T12:00:00')
                    const label = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                    return (
                      <div key={d} className="cal-date-item">
                        <span>{label}</span>
                        <button className="cal-remove-btn" onClick={() => handleRemove(d)} title="Remove">×</button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SchoolAdminView() {
  const { orgId } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    apiGet('/classes').then(cls => setClasses(cls)).finally(() => setLoading(false))
  }, [])

  const teacherLabels = {}
  classes.forEach(cls => {
    teacherLabels[cls.teacher_id] = {
      name: cls.teacher_name || '',
      email: cls.teacher_email || '',
    }
  })
  const byTeacher = classes.reduce((acc, cls) => {
    const tid = cls.teacher_id
    if (!acc[tid]) acc[tid] = []
    acc[tid].push(cls)
    return acc
  }, {})

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 40 }}>Loading...</div>

  if (selected) {
    return (
      <ClassDetail
        cls={selected}
        onBack={() => setSelected(null)}
        onUpdate={fresh => setClasses(prev => prev.map(c =>
          c.class_id === fresh.class_id
            ? { ...fresh, teacher_email: c.teacher_email, teacher_name: c.teacher_name }
            : c
        ))}
      />
    )
  }

  const q = search.trim().toLowerCase()
  const filteredTeachers = Object.entries(byTeacher).filter(([tid]) => {
    if (!q) return true
    const info = teacherLabels[tid] || {}
    return (info.name || '').toLowerCase().includes(q) ||
           (info.email || '').toLowerCase().includes(q)
  })
  const visibleTeachers = q ? filteredTeachers : filteredTeachers.slice(0, visibleCount)
  const hasMore = !q && filteredTeachers.length > visibleCount

  return (
    <>
      <AlertSettingsCard orgId={orgId} />
      <AcademicCalendarCard orgId={orgId} />
      <div className="admin-search-row">
        <input
          className="admin-input admin-search-input"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE) }}
          placeholder="Search teachers…"
        />
      </div>
      <div className="teacher-list">
        {visibleTeachers.map(([tid, teacherClasses]) => {
          const info = teacherLabels[tid] || {}
          const displayName = info.name || info.email || 'Unknown teacher'
          const subLabel = info.name ? info.email : null
          const avatarSeed = info.email || tid
          const av = avatarPalette(avatarSeed)
          const isOpen = expanded === tid
          return (
            <div key={tid} className={`teacher-item${isOpen ? ' is-expanded' : ''}`}>
              <button className="teacher-row-btn" onClick={() => setExpanded(isOpen ? null : tid)}>
                <div className="teacher-avatar" style={{ background: av.bg, border: `1px solid ${av.border}` }}>
                  {(info.name?.trim()?.[0] || avatarSeed[0]).toUpperCase()}
                </div>
                <div className="teacher-info">
                  <div className="teacher-email-label">{displayName}</div>
                  {subLabel && <div className="teacher-sub-label">{subLabel}</div>}
                  <div className="teacher-count-chip">
                    {teacherClasses.length} {teacherClasses.length === 1 ? 'class' : 'classes'}
                  </div>
                </div>
                <span className="teacher-chevron">›</span>
              </button>
              {isOpen && (
                <div className="teacher-classes">
                  <div className="class-grid">
                    {teacherClasses.map(cls => (
                      <div key={cls.class_id} className="class-card class-card--nested" onClick={() => setSelected(cls)}>
                        {(cls.time || cls.days?.length > 0) && (
                          <div className="class-card-header">
                            {cls.time && <span className="class-card-time">{formatTime(cls.time)}</span>}
                            {cls.days?.length > 0 && (
                              <div className="class-card-days">
                                {cls.days.map(d => <DayBadge key={d} day={d} />)}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="class-card-body">
                          <div className="class-card-name">{cls.name}</div>
                          <div className="class-card-stats">
                            <div className="class-card-stat"><span>{(cls.student_ids || []).length}</span> students</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filteredTeachers.length === 0 && (
          <div className="admin-empty">
            {q ? 'No teachers match your search.' : 'No classes found in your organization.'}
          </div>
        )}
        {hasMore && (
          <button
            className="admin-btn"
            style={{ marginTop: 16, width: '100%' }}
            onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
          >
            Load more ({filteredTeachers.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </>
  )
}

// ─── District Admin View ──────────────────────────────────────────────────────

function DistrictAdminView() {
  return (
    <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 15, marginBottom: 8 }}>District dashboard coming soon.</div>
      <div style={{ fontSize: 13 }}>School and teacher management at the district level is under development.</div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { role } = useAuth()

  return (
    <div className="admin-root">
      <HeaderModern page="admin" />
      <div className="admin-page">
        {role === 'teacher' && <TeacherView />}
        {role === 'school_admin' && <SchoolAdminView />}
        {role === 'district_admin' && <DistrictAdminView />}
      </div>
    </div>
  )
}
