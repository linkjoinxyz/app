import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost, apiDelete, apiPatch, apiPut, apiDownload } from '../api/client.js'
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
  const [interventions, setInterventions] = useState([])
  const [expandedCase, setExpandedCase] = useState(null)
  const [noteInputs, setNoteInputs] = useState({})
  const [addInput, setAddInput] = useState('')
  const [addErr, setAddErr] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [exporting, setExporting] = useState(false)

  // Family alerts
  const [familyAlerts, setFamilyAlerts] = useState(cls.family_alerts || false)
  const [parentContacts, setParentContacts] = useState({})
  const [expandedContact, setExpandedContact] = useState(null)
  const [contactSaved, setContactSaved] = useState({})

  async function toggleFamilyAlerts() {
    const next = !familyAlerts
    setFamilyAlerts(next)
    try {
      await apiPut(`/classes/${cls.class_id}`, { family_alerts: next })
    } catch { setFamilyAlerts(!next) }
  }

  async function loadParentContact(userId) {
    if (parentContacts[userId] !== undefined) return
    try {
      const data = await apiGet(`/users/parent-contact/${userId}`)
      setParentContacts(p => ({ ...p, [userId]: data }))
    } catch {
      setParentContacts(p => ({ ...p, [userId]: {} }))
    }
  }

  function updateContactField(userId, field, value) {
    setParentContacts(p => ({ ...p, [userId]: { ...(p[userId] || {}), [field]: value } }))
  }

  async function saveParentContact(userId) {
    const c = parentContacts[userId] || {}
    try {
      await apiPatch('/users/parent-contact', {
        student_user_id: userId,
        parent_name: c.parent_name || '',
        parent_phone: c.parent_phone || '',
        parent_phone_country: c.parent_phone_country || '1',
        parent_email: c.parent_email || '',
      })
      setContactSaved(p => ({ ...p, [userId]: true }))
      setTimeout(() => setContactSaved(p => ({ ...p, [userId]: false })), 2000)
    } catch { /* ignore */ }
  }

  // Google Classroom integration
  const [gcConnected, setGcConnected] = useState(false)
  const [gcCourses, setGcCourses] = useState([])
  const [gcSyncing, setSyncing] = useState(false)
  const [gcSyncResult, setGcSyncResult] = useState(null)
  const [gcConnecting, setGcConnecting] = useState(false)

  useEffect(() => {
    Promise.all([
      apiGet(`/classes/${cls.class_id}`),
      apiGet('/links'),
      apiGet(`/attendance/class/${cls.class_id}`).catch(() => ({ records: [] })),
      apiGet(`/attendance/class/${cls.class_id}/patterns`).catch(() => null),
      apiGet(`/interventions?class_id=${cls.class_id}`).catch(() => []),
      apiGet('/integrations/google/status').catch(() => ({ connected: false })),
    ]).then(([fresh, linksRes, attRes, patternsRes, ivs, gcStatus]) => {
      setStudents(fresh.students || [])
      const links = linksRes.links || []
      setAllLinks(links)
      setClassLinks(links.filter(l => (fresh.link_ids || []).includes(l.id)))
      setAttendance(attRes.records || [])
      setPatterns(patternsRes)
      setInterventions(Array.isArray(ivs) ? ivs : [])
      onUpdate(fresh)
      setGcConnected(gcStatus.connected || false)
      if (gcStatus.connected) {
        apiGet('/integrations/google/courses').then(r => setGcCourses(r.courses || [])).catch(() => {})
      }
    }).catch(() => {})
  }, [cls.class_id])

  async function handleGcConnect() {
    setGcConnecting(true)
    try {
      const { url } = await apiGet('/integrations/google/authorize-url')
      const popup = window.open(url, 'gc-oauth', 'width=520,height=640')
      await new Promise((resolve, reject) => {
        const handler = e => {
          if (e.data?.gc === 'connected') { window.removeEventListener('message', handler); resolve() }
          if (e.data?.gc === 'error') { window.removeEventListener('message', handler); reject(new Error('OAuth error')) }
        }
        window.addEventListener('message', handler)
        const timer = setInterval(() => { if (popup?.closed) { clearInterval(timer); reject(new Error('Closed')) } }, 500)
      })
      setGcConnected(true)
      const r = await apiGet('/integrations/google/courses')
      setGcCourses(r.courses || [])
    } catch { /* user closed popup */ }
    setGcConnecting(false)
  }

  async function handleGcCourseSelect(e) {
    const courseId = e.target.value
    if (!courseId) return
    const course = gcCourses.find(c => c.id === courseId)
    await apiPost('/integrations/google/connect', {
      class_id: cls.class_id,
      gc_course_id: courseId,
      gc_course_name: course?.name || '',
    })
    onUpdate({ ...cls, gc_course_id: courseId, gc_course_name: course?.name || '' })
  }

  async function handleGcSync() {
    setSyncing(true)
    setGcSyncResult(null)
    try {
      const res = await apiPost(`/integrations/google/sync/${cls.class_id}`)
      setGcSyncResult({ ok: true, synced: res.synced, total: res.total })
    } catch {
      setGcSyncResult({ ok: false })
    }
    setSyncing(false)
  }

  async function handleGcDisconnect() {
    await apiDelete(`/integrations/google/disconnect/${cls.class_id}`)
    onUpdate({ ...cls, gc_course_id: null, gc_course_name: null })
  }

  function interventionFor(email, flagType) {
    return interventions.find(iv => iv.student_email === email && iv.flag_type === flagType) || null
  }

  async function openCase(email, flagType) {
    try {
      const iv = await apiPost('/interventions', {
        class_id: cls.class_id,
        student_email: email,
        flag_type: flagType,
      })
      setInterventions(prev => {
        const exists = prev.find(x => x.intervention_id === iv.intervention_id)
        return exists ? prev.map(x => x.intervention_id === iv.intervention_id ? iv : x) : [iv, ...prev]
      })
      setExpandedCase(iv.intervention_id)
    } catch (e) {
      console.error(e)
    }
  }

  async function updateCase(ivId, updates) {
    try {
      const updated = await apiPatch(`/interventions/${ivId}`, updates)
      setInterventions(prev => prev.map(x => x.intervention_id === ivId ? updated : x))
    } catch (e) {
      console.error(e)
    }
  }

  async function excuseRecord(recordId, excused, reason = '') {
    try {
      await apiPatch(`/attendance/${recordId}`, { excused, excuse_reason: reason })
      setAttendance(prev =>
        prev.map(r => r.record_id === recordId ? { ...r, excused, excuse_reason: reason } : r)
      )
    } catch (e) {
      console.error(e)
    }
  }

  async function excuseAbsence(studentEmail, date, shouldExcuse) {
    try {
      if (shouldExcuse) {
        await apiPost(`/classes/${cls.class_id}/excuse-absence`, { student_email: studentEmail, date })
      } else {
        await apiDelete(`/classes/${cls.class_id}/excuse-absence`, { student_email: studentEmail, date })
      }
      setPatterns(prev => {
        if (!prev) return prev
        return {
          ...prev,
          students: prev.students.map(s => {
            if (s.student_email !== studentEmail) return s
            const excusedDates = shouldExcuse
              ? [...s.excused_absence_dates, date].sort()
              : s.excused_absence_dates.filter(d => d !== date)
            const missedDates = shouldExcuse
              ? s.missed_dates.filter(d => d !== date)
              : [...s.missed_dates, date].sort()
            const effectiveExpected = Math.max(
              (prev.expected_count || 0) - excusedDates.length, 0
            )
            const attendanceRate = effectiveExpected > 0
              ? Math.min(s.sessions / effectiveExpected, 1.0)
              : 1.0
            return {
              ...s,
              excused_absence_dates: excusedDates,
              missed_dates: missedDates,
              effective_expected: effectiveExpected,
              attendance_rate: Math.round(attendanceRate * 100) / 100,
            }
          }),
        }
      })
    } catch (e) {
      console.error(e)
    }
  }

  async function addNote(ivId) {
    const text = (noteInputs[ivId] || '').trim()
    if (!text) return
    try {
      const note = await apiPost(`/interventions/${ivId}/notes`, { text })
      setInterventions(prev => prev.map(x =>
        x.intervention_id === ivId ? { ...x, notes: [...(x.notes || []), note], updated_at: note.created_at } : x
      ))
      setNoteInputs(p => ({ ...p, [ivId]: '' }))
    } catch (e) {
      console.error(e)
    }
  }

  async function deleteNote(ivId, noteId) {
    try {
      await apiDelete(`/interventions/${ivId}/notes/${noteId}`)
      setInterventions(prev => prev.map(x =>
        x.intervention_id === ivId ? { ...x, notes: (x.notes || []).filter(n => n.note_id !== noteId) } : x
      ))
    } catch (e) {
      console.error(e)
    }
  }

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
            <label className="fa-toggle-label" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              <span>Family absence alerts</span>
              <input type="checkbox" checked={familyAlerts} onChange={toggleFamilyAlerts} style={{ accentColor: 'var(--sc-accent)' }} />
            </label>
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
                  <tr><th>Email</th><th></th><th></th></tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <>
                      <tr key={s.user_id}>
                        <td>{s.username}</td>
                        <td>
                          <button className="roster-contact-btn" onClick={() => {
                            const next = expandedContact === s.user_id ? null : s.user_id
                            setExpandedContact(next)
                            if (next) loadParentContact(s.user_id)
                          }}>
                            {expandedContact === s.user_id ? 'Close' : 'Parent contact'}
                          </button>
                        </td>
                        <td>
                          <button className="roster-remove-btn" onClick={() => handleRemoveStudent(s.user_id)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                      {expandedContact === s.user_id && (
                        <tr key={`${s.user_id}-contact`} className="roster-contact-row">
                          <td colSpan={3}>
                            <div className="roster-contact-fields">
                              <input className="admin-input" placeholder="Parent name (e.g. Mrs. Johnson)"
                                value={(parentContacts[s.user_id] || {}).parent_name || ''}
                                onChange={e => updateContactField(s.user_id, 'parent_name', e.target.value)} />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input className="admin-input" placeholder="Country code" style={{ width: 72 }}
                                  value={(parentContacts[s.user_id] || {}).parent_phone_country || '1'}
                                  onChange={e => updateContactField(s.user_id, 'parent_phone_country', e.target.value)} />
                                <input className="admin-input" placeholder="Parent phone"
                                  value={(parentContacts[s.user_id] || {}).parent_phone || ''}
                                  onChange={e => updateContactField(s.user_id, 'parent_phone', e.target.value)} />
                              </div>
                              <input className="admin-input" placeholder="Parent email" type="email"
                                value={(parentContacts[s.user_id] || {}).parent_email || ''}
                                onChange={e => updateContactField(s.user_id, 'parent_email', e.target.value)} />
                              <button className="admin-btn" onClick={() => saveParentContact(s.user_id)}>
                                {contactSaved[s.user_id] ? '✓ Saved' : 'Save'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((r, i) => {
                    const dt = new Date(r.opened_at)
                    const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    const timeStr = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                    const tardyThreshold = patterns?.thresholds?.tardy_threshold_minutes ?? 5
                    const late = r.minutes_late
                    const isTardy = late > tardyThreshold
                    let statusLabel, statusClass
                    if (r.excused) {
                      statusLabel = isTardy ? `${late}m late` : (late <= 1 ? 'On time' : `${late}m late`)
                      statusClass = isTardy ? 'att-late' : 'att-on-time'
                    } else if (late <= 1) {
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
                      <tr key={i} className={r.excused ? 'att-row--excused' : ''}>
                        <td className="att-email">{r.student_email}</td>
                        <td className="att-time">{dateStr} {timeStr}</td>
                        <td>
                          <span className={`att-badge ${statusClass}`}>{statusLabel}</span>
                          {r.excused && <span className="att-badge att-excused" style={{ marginLeft: 4 }}>Excused</span>}
                        </td>
                        <td className="att-action-cell">
                          {r.excused ? (
                            <button className="att-undo-btn" onClick={() => excuseRecord(r.record_id, false)}>Undo</button>
                          ) : isTardy ? (
                            <button className="iv-open-btn" onClick={() => excuseRecord(r.record_id, true)}>Excuse</button>
                          ) : null}
                        </td>
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {patterns.students.map((s, i) => {
                      const pct = Math.round(s.attendance_rate * 100)
                      const hasFlags = s.flags.length > 0
                      const effectiveExpected = s.effective_expected ?? patterns.expected_count
                      const missedDates = s.missed_dates || []
                      const excusedAbsenceDates = new Set(s.excused_absence_dates || [])
                      const hasAbsencesToExcuse = missedDates.length > 0 || excusedAbsenceDates.size > 0
                      return (
                        <tr key={i} className={hasFlags ? 'pattern-row--flagged' : ''}>
                          <td className="att-email">
                            <div>{s.student_email}</div>
                            {hasAbsencesToExcuse && (
                              <div className="att-excuse-dates">
                                {missedDates.map(d => (
                                  <button key={d} className="att-date-pill" onClick={() => excuseAbsence(s.student_email, d, true)}>
                                    {d.slice(5)}
                                  </button>
                                ))}
                                {[...excusedAbsenceDates].sort().map(d => (
                                  <button key={d} className="att-date-pill att-date-pill--excused" onClick={() => excuseAbsence(s.student_email, d, false)}>
                                    {d.slice(5)} ×
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="att-rate-bar">
                              <div className="att-rate-fill" style={{ width: `${pct}%`, background: pct >= 80 ? '#48c578' : pct >= 50 ? '#f0c040' : '#ff6b6b' }} />
                            </div>
                            <span className="att-rate-label">{s.sessions}/{effectiveExpected}</span>
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
                          <td>
                            {s.flags.map(f => {
                              const iv = interventionFor(s.student_email, f)
                              if (iv) {
                                return (
                                  <button key={f} className={`iv-status-pill iv-status-pill--${iv.status}`}
                                    onClick={() => setExpandedCase(expandedCase === iv.intervention_id ? null : iv.intervention_id)}>
                                    {iv.status === 'open' ? 'Open' : iv.status === 'in_progress' ? 'In progress' : 'Resolved'}
                                  </button>
                                )
                              }
                              return (
                                <button key={f} className="iv-open-btn" onClick={() => openCase(s.student_email, f)}>
                                  Open case
                                </button>
                              )
                            })}
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

        {/* Interventions section */}
        {interventions.length > 0 && (
          <div className="detail-section-card detail-section-card--full">
            <div className="detail-section-header">
              <span className="detail-section-label">Interventions</span>
              <span className="detail-section-count">{interventions.filter(iv => iv.status !== 'resolved').length} open</span>
            </div>
            <div className="detail-section-body">
              <div className="iv-list">
                {interventions.map(iv => (
                  <div key={iv.intervention_id} className="iv-item">
                    <button
                      className={`iv-row${expandedCase === iv.intervention_id ? ' iv-row--active' : ''}`}
                      onClick={() => setExpandedCase(expandedCase === iv.intervention_id ? null : iv.intervention_id)}
                    >
                      <div className="iv-row-left">
                        <span className="iv-student-name">{iv.student_name || iv.student_email}</span>
                        {iv.student_name && <span className="iv-student-email">{iv.student_email}</span>}
                        <span className={`att-badge ${iv.flag_type === 'repeat_tardy' ? 'att-late' : 'att-slightly-late'}`} style={{ marginLeft: 6 }}>
                          {iv.flag_type === 'repeat_tardy' ? 'Repeat tardy' : 'Low attendance'}
                        </span>
                      </div>
                      <div className="iv-row-right">
                        {iv.assigned_to && <span className="iv-assigned">{iv.assigned_to}</span>}
                        {(iv.notes || []).length > 0 && (
                          <span className="iv-note-count">{(iv.notes || []).length} note{iv.notes.length !== 1 ? 's' : ''}</span>
                        )}
                        <span className={`iv-status-pill iv-status-pill--${iv.status}`}>
                          {iv.status === 'open' ? 'Open' : iv.status === 'in_progress' ? 'In progress' : 'Resolved'}
                        </span>
                        <span className="iv-chevron">{expandedCase === iv.intervention_id ? '▾' : '▸'}</span>
                      </div>
                    </button>

                    {expandedCase === iv.intervention_id && (
                      <div className="iv-detail">
                        <div className="iv-detail-controls">
                          <div className="iv-control-group">
                            <label className="iv-control-label">Status</label>
                            <select
                              className="iv-select"
                              value={iv.status}
                              onChange={e => updateCase(iv.intervention_id, { status: e.target.value })}
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In progress</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </div>
                          <div className="iv-control-group">
                            <label className="iv-control-label">Assigned to</label>
                            <input
                              className="iv-input"
                              placeholder="staff email"
                              defaultValue={iv.assigned_to || ''}
                              onBlur={e => updateCase(iv.intervention_id, { assigned_to: e.target.value || null })}
                            />
                          </div>
                        </div>

                        <div className="iv-notes">
                          {(iv.notes || []).length === 0 && (
                            <div className="iv-no-notes">No notes yet.</div>
                          )}
                          {(iv.notes || []).map(note => (
                            <div key={note.note_id} className="iv-note">
                              <div className="iv-note-header">
                                <span className="iv-note-author">{note.author_email}</span>
                                <span className="iv-note-date">{new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                <button className="iv-note-delete" onClick={() => deleteNote(iv.intervention_id, note.note_id)} title="Delete">&#x2715;</button>
                              </div>
                              <div className="iv-note-text">{note.text}</div>
                            </div>
                          ))}
                        </div>

                        <div className="iv-add-note">
                          <input
                            className="iv-input iv-note-input"
                            placeholder="Add a note..."
                            value={noteInputs[iv.intervention_id] || ''}
                            onChange={e => setNoteInputs(p => ({ ...p, [iv.intervention_id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote(iv.intervention_id)}
                          />
                          <button
                            className="iv-add-note-btn"
                            disabled={!(noteInputs[iv.intervention_id] || '').trim()}
                            onClick={() => addNote(iv.intervention_id)}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Google Classroom integration */}
        <div className="detail-section-card detail-section-card--full">
          <div className="detail-section-header">
            <span className="detail-section-label">Google Classroom</span>
            {cls.gc_course_id && (
              <span className="gc-connected-badge">Connected</span>
            )}
          </div>
          <div className="detail-section-body gc-section-body">
            {!gcConnected ? (
              <div className="gc-prompt">
                <p className="gc-prompt-text">Connect your Google account to sync attendance scores directly to your Google Classroom gradebook.</p>
                <button className="gc-connect-btn" onClick={handleGcConnect} disabled={gcConnecting}>
                  {gcConnecting ? 'Connecting...' : (
                    <><span className="gc-g">G</span> Connect Google Classroom</>
                  )}
                </button>
              </div>
            ) : !cls.gc_course_id ? (
              <div className="gc-prompt">
                <p className="gc-prompt-text">Select which Google Classroom course maps to this class. Attendance scores will sync to that course's gradebook.</p>
                <select className="gc-course-select" defaultValue="" onChange={handleGcCourseSelect}>
                  <option value="" disabled>Select a course...</option>
                  {gcCourses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="gc-connected">
                <div className="gc-course-row">
                  <span className="gc-course-icon">C</span>
                  <div className="gc-course-info">
                    <div className="gc-course-name">{cls.gc_course_name}</div>
                    <div className="gc-course-meta">Scores post to the "Attendance" assignment (0-100)</div>
                  </div>
                </div>
                {gcSyncResult && (
                  <div className={`gc-sync-result ${gcSyncResult.ok ? 'gc-sync-result--ok' : 'gc-sync-result--err'}`}>
                    {gcSyncResult.ok
                      ? `Synced ${gcSyncResult.synced} of ${gcSyncResult.total} students`
                      : 'Sync failed. Check your connection and try again.'}
                  </div>
                )}
                <div className="gc-actions">
                  <button className="gc-sync-btn" onClick={handleGcSync} disabled={gcSyncing}>
                    {gcSyncing ? 'Syncing...' : 'Sync attendance now'}
                  </button>
                  <button className="gc-disconnect-btn" onClick={handleGcDisconnect}>Disconnect</button>
                </div>
              </div>
            )}
          </div>
        </div>

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

// ─── Org Intervention List ────────────────────────────────────────────────────

function OrgInterventionList({ onBack }) {
  const [interventions, setInterventions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [expandedCase, setExpandedCase] = useState(null)
  const [noteInputs, setNoteInputs] = useState({})

  useEffect(() => {
    setLoading(true)
    const qs = filter === 'all' ? '?status=all' : filter === 'resolved' ? '?status=resolved' : ''
    apiGet(`/interventions${qs}`).then(ivs => setInterventions(Array.isArray(ivs) ? ivs : [])).finally(() => setLoading(false))
  }, [filter])

  async function updateCase(ivId, updates) {
    try {
      const updated = await apiPatch(`/interventions/${ivId}`, updates)
      setInterventions(prev => prev.map(x => x.intervention_id === ivId ? updated : x))
    } catch (e) { console.error(e) }
  }

  async function addNote(ivId) {
    const text = (noteInputs[ivId] || '').trim()
    if (!text) return
    try {
      const note = await apiPost(`/interventions/${ivId}/notes`, { text })
      setInterventions(prev => prev.map(x =>
        x.intervention_id === ivId ? { ...x, notes: [...(x.notes || []), note] } : x
      ))
      setNoteInputs(p => ({ ...p, [ivId]: '' }))
    } catch (e) { console.error(e) }
  }

  async function deleteNote(ivId, noteId) {
    try {
      await apiDelete(`/interventions/${ivId}/notes/${noteId}`)
      setInterventions(prev => prev.map(x =>
        x.intervention_id === ivId ? { ...x, notes: (x.notes || []).filter(n => n.note_id !== noteId) } : x
      ))
    } catch (e) { console.error(e) }
  }

  const q = search.trim().toLowerCase()
  const flagLabel = f => f === 'repeat_tardy' ? 'repeat tardy' : 'low attendance'
  const visible = q
    ? interventions.filter(iv =>
        (iv.student_name || '').toLowerCase().includes(q) ||
        (iv.student_email || '').toLowerCase().includes(q) ||
        flagLabel(iv.flag_type).includes(q) ||
        (iv.class_name || '').toLowerCase().includes(q)
      )
    : interventions

  return (
    <div>
      <div className="iv-toolbar">
        <input
          className="admin-input admin-search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, category, or class…"
        />
        <div className="iv-filter-row">
          {['active', 'resolved', 'all'].map(f => (
            <button key={f} className={`iv-filter-btn${filter === f ? ' iv-filter-btn--active' : ''}`}
              onClick={() => { setFilter(f); setExpandedCase(null) }}>
              {f === 'active' ? 'Open / In progress' : f === 'resolved' ? 'Resolved' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 24 }}>Loading...</div>}
      {!loading && visible.length === 0 && (
        <div className="admin-empty" style={{ marginTop: 24 }}>{q ? 'No matches.' : 'No interventions found.'}</div>
      )}

      <div className="iv-list" style={{ marginTop: 12 }}>
        {visible.map(iv => (
          <div key={iv.intervention_id} className="iv-item">
            <button
              className={`iv-row${expandedCase === iv.intervention_id ? ' iv-row--active' : ''}`}
              onClick={() => setExpandedCase(expandedCase === iv.intervention_id ? null : iv.intervention_id)}
            >
              <div className="iv-row-left">
                <span className="iv-student-name">{iv.student_name || iv.student_email}</span>
                {iv.student_name && <span className="iv-student-email">{iv.student_email}</span>}
                <span className="iv-class-chip">{iv.class_name}</span>
                <span className={`att-badge ${iv.flag_type === 'repeat_tardy' ? 'att-late' : 'att-slightly-late'}`} style={{ marginLeft: 4 }}>
                  {iv.flag_type === 'repeat_tardy' ? 'Repeat tardy' : 'Low attendance'}
                </span>
              </div>
              <div className="iv-row-right">
                {iv.assigned_to && <span className="iv-assigned">{iv.assigned_to}</span>}
                {(iv.notes || []).length > 0 && (
                  <span className="iv-note-count">{iv.notes.length} note{iv.notes.length !== 1 ? 's' : ''}</span>
                )}
                <span className={`iv-status-pill iv-status-pill--${iv.status}`}>
                  {iv.status === 'open' ? 'Open' : iv.status === 'in_progress' ? 'In progress' : 'Resolved'}
                </span>
                <span className="iv-chevron">{expandedCase === iv.intervention_id ? '▾' : '▸'}</span>
              </div>
            </button>

            {expandedCase === iv.intervention_id && (
              <div className="iv-detail">
                <div className="iv-detail-controls">
                  <div className="iv-control-group">
                    <label className="iv-control-label">Status</label>
                    <select className="iv-select" value={iv.status} onChange={e => updateCase(iv.intervention_id, { status: e.target.value })}>
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                  <div className="iv-control-group">
                    <label className="iv-control-label">Assigned to</label>
                    <input className="iv-input" placeholder="staff email" defaultValue={iv.assigned_to || ''}
                      onBlur={e => updateCase(iv.intervention_id, { assigned_to: e.target.value || null })} />
                  </div>
                </div>
                <div className="iv-notes">
                  {(iv.notes || []).length === 0 && <div className="iv-no-notes">No notes yet.</div>}
                  {(iv.notes || []).map(note => (
                    <div key={note.note_id} className="iv-note">
                      <div className="iv-note-header">
                        <span className="iv-note-author">{note.author_email}</span>
                        <span className="iv-note-date">{new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        <button className="iv-note-delete" onClick={() => deleteNote(iv.intervention_id, note.note_id)} title="Delete">&#x2715;</button>
                      </div>
                      <div className="iv-note-text">{note.text}</div>
                    </div>
                  ))}
                </div>
                <div className="iv-add-note">
                  <input className="iv-input iv-note-input" placeholder="Add a note..."
                    value={noteInputs[iv.intervention_id] || ''}
                    onChange={e => setNoteInputs(p => ({ ...p, [iv.intervention_id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote(iv.intervention_id)} />
                  <button className="iv-add-note-btn" disabled={!(noteInputs[iv.intervention_id] || '').trim()}
                    onClick={() => addNote(iv.intervention_id)}>Add</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── School Admin View ────────────────────────────────────────────────────────

const PAGE_SIZE = 20

function SchoolAdminView() {
  const { orgId } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [openCases, setOpenCases] = useState([])
  const [showInterventions, setShowInterventions] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [brandSaved, setBrandSaved] = useState(false)

  useEffect(() => {
    apiGet('/classes').then(cls => setClasses(cls)).finally(() => setLoading(false))
    apiGet('/interventions').then(ivs => setOpenCases(Array.isArray(ivs) ? ivs : [])).catch(() => {})
    if (orgId) apiGet(`/orgs/${orgId}`).then(org => setBrandName(org.brand_name || '')).catch(() => {})
  }, [orgId])

  async function saveBrandName() {
    try {
      await apiPatch(`/orgs/${orgId}`, { brand_name: brandName })
      setBrandSaved(true)
      setTimeout(() => setBrandSaved(false), 2000)
    } catch { /* ignore */ }
  }

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
      <div className="admin-tabs">
        <button className={`admin-tab${!showInterventions ? ' admin-tab--active' : ''}`} onClick={() => setShowInterventions(false)}>Teachers</button>
        <button className={`admin-tab${showInterventions ? ' admin-tab--active' : ''}`} onClick={() => setShowInterventions(true)}>
          Interventions
          {openCases.length > 0 && <span className="admin-tab-badge">{openCases.length}</span>}
        </button>
      </div>

      {showInterventions ? <OrgInterventionList onBack={() => setShowInterventions(false)} /> : <>
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
      </>}

      {!showInterventions && (
        <div className="org-brand-section">
          <div className="org-brand-label">Notification display name</div>
          <div className="org-brand-row">
            <input className="admin-input" placeholder="e.g. Lincoln High School"
              value={brandName} onChange={e => setBrandName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveBrandName()} />
            <button className="admin-btn" onClick={saveBrandName}>
              {brandSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            Shown in absence alert texts and emails instead of "LinkJoin"
          </div>
        </div>
      )}
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
