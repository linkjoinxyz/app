import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useMatch, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost, apiDelete, apiPatch, apiPut, apiDownload } from '../api/client.js'
import SideNav from '../components/SideNav.jsx'
import LinkModal from '../components/LinkModal.jsx'
import HistoryPanel from '../components/HistoryPanel.jsx'
import countryCodes from '../../public/country_codes.json'
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

// ─── Student Profile ─────────────────────────────────────────────────────────

function ParentProfile({ userId, onBack, onOpenStudent }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const palette = avatarPalette(userId)

  useEffect(() => {
    setLoading(true)
    apiGet(`/users/parent/${userId}`)
      .then(d => setData(d))
      .catch(() => setErr('Could not load parent profile.'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return <div className="admin-spinner-wrap"><div className="admin-spinner" /></div>
  if (err || !data) return <div className="admin-error" style={{ padding: 40 }}>{err || 'Not found'}</div>

  const initials = data.name
    ? data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : data.email[0].toUpperCase()

  return (
    <div className="detail-root">
      <div className="sp-hero">
        <button className="detail-back-btn" onClick={onBack}>
          <img src="/images/arrow-left.svg" alt="back" style={{ width: 18, height: 18, display: 'block' }} />
        </button>
        <div className="sp-avatar" style={data.avatar ? {} : { background: palette.bg, border: `2px solid ${palette.border}` }}>
          {data.avatar
            ? <img src={data.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            : initials}
        </div>
        <div className="sp-hero-info">
          <div className="sp-name">{data.name || data.email}</div>
          {data.name && <div className="sp-email">{data.email}</div>}
          <span className="sp-badge" style={{ background: 'rgba(43,143,216,0.15)', color: '#4db8ff', border: '1px solid rgba(43,143,216,0.3)', marginTop: 10 }}>Parent account</span>
        </div>
      </div>

      <div className="sp-body">
        {data.linked_students.length > 0 && (
          <div className="sp-section">
            <div className="sp-section-title">Linked students</div>
            <div className="sp-class-list">
              {data.linked_students.map(s => (
                <div
                  key={s.user_id}
                  className="sp-class-row sp-class-row--link"
                  onClick={() => onOpenStudent?.(s.user_id)}
                >
                  <div className="sp-class-info">
                    <div className="sp-class-name">{s.name || s.email}</div>
                    {s.name && <div className="sp-class-meta"><span>{s.email}</span></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StudentProfile({ userId, onBack, onOpenClass, onOpenIntervention, onOpenParent }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [parentNotes, setParentNotes] = useState([])

  useEffect(() => {
    setLoading(true)
    apiGet(`/users/student/${userId}`)
      .then(d => setData(d))
      .catch(() => setErr('Could not load student profile.'))
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => {
    apiGet(`/parent/children/${userId}/notes`)
      .then(notes => setParentNotes(Array.isArray(notes) ? notes : []))
      .catch(() => setParentNotes([]))
  }, [userId])

  if (loading) return <div className="admin-spinner-wrap"><div className="admin-spinner" /></div>
  if (err || !data) return <div className="admin-error" style={{ padding: 40 }}>{err || 'Not found'}</div>

  const totalSessions = data.classes.reduce((s, c) => s + c.sessions, 0)
  const totalTardy = data.classes.reduce((s, c) => s + c.tardy, 0)
  const activeInterventions = data.interventions.length

  const initials = data.name
    ? data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : data.email[0].toUpperCase()
  const palette = avatarPalette(data.email)

  return (
    <div className="detail-root">
      <div className="sp-hero">
        <button className="detail-back-btn" onClick={onBack}>
          <img src="/images/arrow-left.svg" alt="back" style={{ width: 18, height: 18, display: 'block' }} />
        </button>
        <div className="sp-avatar" style={data.avatar ? {} : { background: palette.bg, border: `2px solid ${palette.border}` }}>
          {data.avatar
            ? <img src={data.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            : initials}
        </div>
        <div className="sp-hero-info">
          <div className="sp-name">{data.name || data.email}</div>
          {data.name && <div className="sp-email">{data.email}</div>}
          <div className="sp-badges">
            {!data.confirmed && (
              <span className="sp-badge sp-badge--warn">Unconfirmed</span>
            )}
            {activeInterventions > 0 && (
              <span className="sp-badge sp-badge--flag">{activeInterventions} open intervention{activeInterventions !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>

      <div className="sp-body">
        {/* Stats row */}
        <div className="sp-stats-row">
          <div className="sp-stat">
            <div className="sp-stat-val">{totalSessions}</div>
            <div className="sp-stat-label">Total sessions</div>
          </div>
          <div className="sp-stat">
            <div className="sp-stat-val">{totalSessions > 0 ? Math.round(((totalSessions - totalTardy) / totalSessions) * 100) : '—'}{totalSessions > 0 ? '%' : ''}</div>
            <div className="sp-stat-label">On-time rate</div>
          </div>
          <div className="sp-stat">
            <div className="sp-stat-val">{data.classes.length}</div>
            <div className="sp-stat-label">Classes</div>
          </div>
          <div className="sp-stat">
            <div className="sp-stat-val" style={{ color: activeInterventions > 0 ? '#f0c040' : 'inherit' }}>{activeInterventions}</div>
            <div className="sp-stat-label">Open interventions</div>
          </div>
          {(() => {
            const parents = data.parent.linked_accounts || []
            return (
              <div className="sp-stat">
                <div className="sp-stat-val sp-stat-val--parent">
                  {parents.length === 0
                    ? '—'
                    : parents.map(p => (
                        <div
                          key={p.user_id}
                          className={onOpenParent ? 'sp-parent-stat-name' : undefined}
                          onClick={() => onOpenParent?.(p.user_id)}
                        >
                          {p.name || p.email}
                        </div>
                      ))
                  }
                </div>
                <div className="sp-stat-label">{parents.length > 1 ? 'Parents' : 'Parent'}</div>
              </div>
            )
          })()}
        </div>


        {/* Classes */}
        {data.classes.length > 0 && (
          <div className="sp-section">
            <div className="sp-section-title">Classes</div>
            <div className="sp-class-list">
              {data.classes.map(c => {
                const pct = c.sessions > 0 ? Math.round(((c.sessions - c.tardy) / c.sessions) * 100) : null
                return (
                  <div
                    key={c.class_id}
                    className={`sp-class-row${onOpenClass ? ' sp-class-row--link' : ''}`}
                    onClick={() => onOpenClass?.(c.class_id)}
                  >
                    <div className="sp-class-info">
                      <div className="sp-class-name">{c.class_name}</div>
                      <div className="sp-class-meta">
                        {c.teacher_name && <span>{c.teacher_name}</span>}
                        {c.days?.length > 0 && <span>{c.days.join(' · ')}</span>}
                        {c.time && <span>{c.time}</span>}
                      </div>
                    </div>
                    <div className="sp-class-stats">
                      <span className="sp-class-stat-label">{c.sessions} sessions</span>
                      {c.tardy > 0 && <span className="sp-class-stat-warn">{c.tardy} tardy</span>}
                      {pct !== null && (
                        <div className="att-rate-bar" style={{ width: 60 }}>
                          <div className="att-rate-fill" style={{ width: `${pct}%`, background: pct >= 80 ? '#48c578' : pct >= 50 ? '#f0c040' : '#ff6b6b' }} />
                        </div>
                      )}
                      {onOpenClass && <span className="sp-row-chevron">›</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Interventions */}
        {data.interventions.length > 0 && (
          <div className="sp-section">
            <div className="sp-section-title">Open interventions</div>
            <div className="sp-iv-list">
              {data.interventions.map(iv => (
                <div
                  key={iv.intervention_id}
                  className={`sp-iv-row${onOpenIntervention && iv.class_id ? ' sp-iv-row--link' : ''}`}
                  onClick={() => iv.class_id && onOpenIntervention?.(iv.class_id, iv.intervention_id)}
                >
                  <div className="sp-iv-left">
                    <span className={`iv-status-pill iv-status-pill--${iv.status}`}>
                      {iv.status === 'open' ? 'Open' : iv.status === 'in_progress' ? 'In progress' : iv.status}
                    </span>
                    <span className="sp-iv-class">{iv.class_name}</span>
                  </div>
                  <div className="sp-iv-right">
                    <span className={`att-badge ${iv.flag_type === 'repeat_tardy' ? 'att-late' : 'att-slightly-late'}`}>
                      {iv.flag_type === 'repeat_tardy' ? 'Repeat tardy' : 'Low attendance'}
                    </span>
                    {iv.notes?.length > 0 && <span className="sp-iv-notes">{iv.notes.length} note{iv.notes.length !== 1 ? 's' : ''}</span>}
                    {onOpenIntervention && iv.class_id && <span className="sp-row-chevron">›</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent attendance */}
        {data.recent_attendance.length > 0 && (
          <div className="sp-section">
            <div className="sp-section-title">Recent attendance <span className="sp-section-sub">(last 90 days)</span></div>
            <table className="sp-att-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_attendance.map((r, i) => {
                  const late = r.minutes_late > 0
                  const excused = r.excused
                  const label = excused ? 'Excused' : late ? `${r.minutes_late}m late` : 'On time'
                  const color = excused ? 'rgba(255,255,255,0.65)' : late ? '#f0c040' : '#48c578'
                  return (
                    <tr key={i}>
                      <td className="sp-att-date">{r.opened_at?.slice(0, 10)}</td>
                      <td className="sp-att-class">{r.class_name}</td>
                      <td><span style={{ color, fontSize: 12 }}>{label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.recent_attendance.length === 0 && data.classes.length === 0 && (
          <div className="admin-empty" style={{ padding: '40px 0' }}>No attendance data yet.</div>
        )}

        {/* Parent notes */}
        {parentNotes.length > 0 && (
          <div className="sp-section">
            <div className="sp-section-title">Parent notes</div>
            <table className="sp-att-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Note</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {parentNotes.map(n => (
                  <tr key={n.id}>
                    <td className="sp-att-date">{n.date}</td>
                    <td className="sp-att-class">{n.class_name}</td>
                    <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', maxWidth: 280 }}>{n.note}</td>
                    <td>
                      {n.is_excuse
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Excuse</span>
                        : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Note</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Class Detail (teacher view) ─────────────────────────────────────────────

function ClassDetail({ cls, onBack, onUpdate, onViewStudent }) {
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const [students, setStudents] = useState([])
  const [allLinks, setAllLinks] = useState([])
  const [classLinks, setClassLinks] = useState([])
  const [attendance, setAttendance] = useState([])
  const [patterns, setPatterns] = useState(null)
  const [interventions, setInterventions] = useState([])
  const [expandedCase, setExpandedCase] = useState(navState?.expandedCase ?? null)
  const [noteInputs, setNoteInputs] = useState({})
  const [classTab, setClassTab] = useState(navState?.tab ?? 'links')
  const [detailLoading, setDetailLoading] = useState(true)
  const [assignedDrafts, setAssignedDrafts] = useState({})
  const [assignedSaved, setAssignedSaved] = useState({})
  const [addInput, setAddInput] = useState('')
  const [addErr, setAddErr] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [exporting, setExporting] = useState(false)

  // Manual attendance override
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideDate, setOverrideDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [overridePresent, setOverridePresent] = useState({})
  const [overrideStatus, setOverrideStatus] = useState('present')
  const [overrideReasonCode, setOverrideReasonCode] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [overrideJoinTime, setOverrideJoinTime] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)

  const OVERRIDE_REASON_CODES = [
    { value: 'joined_outside_linkjoin', label: 'Joined outside LinkJoin (leak)' },
    { value: 'device_failure', label: 'Device failure' },
    { value: 'connectivity_outage', label: 'Connectivity outage' },
    { value: 'excused', label: 'Excused' },
    { value: 'late_enrollment', label: 'Late enrollment' },
    { value: 'other', label: 'Other' },
  ]

  // Student join code
  const [joinCode, setJoinCode] = useState(null) // null = not loaded, false = none exists
  const [joinCodeLoading, setJoinCodeLoading] = useState(false)
  const [joinCopied, setJoinCopied] = useState(false)

  async function loadJoinCode() {
    if (joinCode !== null) return
    setJoinCodeLoading(true)
    try {
      const invites = await apiGet('/invites')
      const active = Array.isArray(invites) ? invites.find(i => i.class_id === cls.class_id && i.type === 'student_class' && i.status === 'pending') : null
      setJoinCode(active || false)
    } catch { setJoinCode(false) }
    setJoinCodeLoading(false)
  }

  async function generateJoinCode() {
    setJoinCodeLoading(true)
    try {
      const inv = await apiPost('/invites', { type: 'student_class', class_id: cls.class_id })
      setJoinCode(inv)
    } catch { /* ignore */ }
    setJoinCodeLoading(false)
  }

  function copyJoinLink() {
    if (!joinCode?.token) return
    const url = `${window.location.origin}/join/${joinCode.token}`
    navigator.clipboard.writeText(url).then(() => { setJoinCopied(true); setTimeout(() => setJoinCopied(false), 2000) })
  }

  // Family alerts
  const [familyAlerts, setFamilyAlerts] = useState(cls.family_alerts || false)
  const [parentContacts, setParentContacts] = useState({})
  const [contactModalUser, setContactModalUser] = useState(null)
  const [parentPopup, setParentPopup] = useState(null)
  const [contactSaved, setContactSaved] = useState({})

  async function toggleFamilyAlerts() {
    const next = !familyAlerts
    setFamilyAlerts(next)
    try {
      await apiPut(`/classes/${cls.class_id}`, { family_alerts: next })
    } catch { setFamilyAlerts(!next) }
  }

  useEffect(() => {
    if (!parentPopup) return
    function close(e) { if (!e.target.closest('.parent-popup') && !e.target.closest('.roster-contact-btn')) setParentPopup(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [parentPopup])

  async function loadParentContact(userId) {
    if (parentContacts[userId] !== undefined) return
    try {
      const data = await apiGet(`/users/parent-contact/${userId}`)
      setParentContacts(p => ({ ...p, [userId]: data }))
    } catch {
      setParentContacts(p => ({ ...p, [userId]: {} }))
    }
  }

  useEffect(() => {
    students.forEach(s => loadParentContact(s.user_id))
  }, [students.length])

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
      apiGet(`/classes/${cls.class_id}/links`),
      apiGet(`/attendance/class/${cls.class_id}`).catch(() => ({ records: [] })),
      apiGet(`/attendance/class/${cls.class_id}/patterns`).catch(() => null),
      apiGet(`/interventions?class_id=${cls.class_id}`).catch(() => []),
      apiGet('/integrations/google/status').catch(() => ({ connected: false })),
    ]).then(([fresh, linksRes, attRes, patternsRes, ivs, gcStatus]) => {
      setStudents(fresh.students || [])
      const links = linksRes.links || []
      setAllLinks(links)
      setClassLinks(links)
      setAttendance(attRes.records || [])
      setPatterns(patternsRes)
      setInterventions(Array.isArray(ivs) ? ivs : [])
      onUpdate(fresh)
      setGcConnected(gcStatus.connected || false)
      if (gcStatus.connected) {
        apiGet('/integrations/google/courses').then(r => setGcCourses(r.courses || [])).catch(() => {})
      }
      setDetailLoading(false)
    }).catch(() => { setDetailLoading(false) })
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

  // Canvas integration
  const [canvasConnected, setCanvasConnected] = useState(false)
  const [canvasOrgConfigured, setCanvasOrgConfigured] = useState(false)
  const [canvasCourses, setCanvasCourses] = useState([])
  const [canvasConnecting, setCanvasConnecting] = useState(false)
  const [canvasSyncing, setCanvasSyncing] = useState(false)
  const [canvasSyncResult, setCanvasSyncResult] = useState(null)

  useEffect(() => {
    apiGet('/integrations/canvas/status').then(r => {
      setCanvasConnected(r.connected || false)
      setCanvasOrgConfigured(r.org_configured || false)
      if (r.connected) {
        apiGet('/integrations/canvas/courses').then(r2 => setCanvasCourses(r2.courses || [])).catch(() => {})
      }
    }).catch(() => {})
  }, [cls.class_id])

  async function handleCanvasConnect() {
    setCanvasConnecting(true)
    try {
      const { url } = await apiGet('/integrations/canvas/authorize-url')
      const popup = window.open(url, 'canvas-oauth', 'width=520,height=640')
      await new Promise((resolve, reject) => {
        const handler = e => {
          if (e.data?.canvas === 'connected') { window.removeEventListener('message', handler); resolve() }
          if (e.data?.canvas === 'error') { window.removeEventListener('message', handler); reject(new Error('OAuth error')) }
        }
        window.addEventListener('message', handler)
        const timer = setInterval(() => { if (popup?.closed) { clearInterval(timer); reject(new Error('Closed')) } }, 500)
      })
      setCanvasConnected(true)
      const r = await apiGet('/integrations/canvas/courses')
      setCanvasCourses(r.courses || [])
    } catch { /* user closed popup */ }
    setCanvasConnecting(false)
  }

  async function handleCanvasCourseSelect(e) {
    const courseId = e.target.value
    if (!courseId) return
    const course = canvasCourses.find(c => c.id === courseId)
    await apiPost('/integrations/canvas/connect', {
      class_id: cls.class_id,
      canvas_course_id: courseId,
      canvas_course_name: course?.name || '',
    })
    onUpdate({ ...cls, canvas_course_id: courseId, canvas_course_name: course?.name || '' })
  }

  async function handleCanvasSync() {
    setCanvasSyncing(true)
    setCanvasSyncResult(null)
    try {
      const res = await apiPost(`/integrations/canvas/sync/${cls.class_id}`)
      setCanvasSyncResult({ ok: true, synced: res.synced, total: res.total })
    } catch {
      setCanvasSyncResult({ ok: false })
    }
    setCanvasSyncing(false)
  }

  async function handleCanvasDisconnect() {
    await apiDelete(`/integrations/canvas/disconnect/${cls.class_id}`)
    onUpdate({ ...cls, canvas_course_id: null, canvas_course_name: null })
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
      setClassTab('interventions')
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

  function currentRecordsForDate(dateStr) {
    const map = {}
    attendance
      .filter(r => (r.record_date || (r.opened_at ? r.opened_at.slice(0, 10) : '')) === dateStr)
      .filter(r => r.is_current !== false && r.record_id)
      .forEach(r => { map[r.student_email] = r })
    return map
  }

  function attendedEmailsForDate(dateStr) {
    return new Set(Object.keys(currentRecordsForDate(dateStr)))
  }

  function resetOverrideChecklist(dateStr) {
    const already = attendedEmailsForDate(dateStr)
    const init = {}
    students.forEach(s => { init[s.username] = already.has(s.username) })
    setOverridePresent(init)
    setOverrideStatus('present')
    setOverrideReasonCode('')
    setOverrideNote('')
    setOverrideJoinTime('')
  }

  function openOverrideModal() {
    resetOverrideChecklist(overrideDate)
    setShowOverrideModal(true)
  }

  function handleOverrideDateChange(d) {
    setOverrideDate(d)
    resetOverrideChecklist(d)
  }

  function toggleOverridePresent(email) {
    setOverridePresent(prev => ({ ...prev, [email]: !prev[email] }))
  }

  async function submitOverride() {
    if (!overrideReasonCode) return
    if (overrideReasonCode === 'other' && !overrideNote.trim()) return
    setOverrideSaving(true)
    try {
      const studentEmails = Object.entries(overridePresent).filter(([, v]) => v).map(([email]) => email)
      await apiPost(`/attendance/class/${cls.class_id}/override`, {
        date: overrideDate,
        student_emails: studentEmails,
        status: overrideStatus,
        reason_code: overrideReasonCode,
        note: overrideNote.trim() || undefined,
        join_time: overrideJoinTime || undefined,
      })
      const attRes = await apiGet(`/attendance/class/${cls.class_id}`)
      setAttendance(attRes.records || [])
      setShowOverrideModal(false)
    } catch (e) {
      console.error(e)
    }
    setOverrideSaving(false)
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
          students: (prev.students || []).map(s => {
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
      setAttendance(prev => prev.map(r =>
        r.absent && r.student_email === studentEmail && (r.record_date || r.opened_at?.slice(0, 10)) === date
          ? { ...r, excused: shouldExcuse }
          : r
      ))
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
        apiGet(`/classes/${cls.class_id}/links`),
      ])
      const links = linksRes.links || []
      setAllLinks(links)
      setClassLinks(links)
      onUpdate(fresh)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleLinkEdited() {
    try {
      const [fresh, linksRes] = await Promise.all([
        apiGet(`/classes/${cls.class_id}`),
        apiGet(`/classes/${cls.class_id}/links`),
      ])
      const links = linksRes.links || []
      setAllLinks(links)
      setClassLinks(links)
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

      {/* Tab bar */}
      <div className="detail-tab-bar">
        {[
          { key: 'links',        label: 'Links' },
          { key: 'students',     label: 'Students' },
          { key: 'attendance',   label: 'Attendance' },
          { key: 'patterns',     label: 'Patterns' },
          { key: 'interventions', label: 'Interventions', badge: interventions.filter(iv => iv.status !== 'resolved').length || null },
          { key: 'integrations', label: 'Integrations' },
        ].map(t => (
          <button
            key={t.key}
            className={`detail-tab-btn${classTab === t.key ? ' detail-tab-btn--active' : ''}`}
            onClick={() => setClassTab(t.key)}
          >
            {t.label}
            {t.badge ? <span className="detail-tab-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="detail-tab-body">

        {detailLoading ? (
          <div className="admin-spinner-wrap"><div className="admin-spinner" /></div>
        ) : <>

        {/* Links tab */}
        {classTab === 'links' && (
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
        )}

        {showLinkModal && (
          <LinkModal
            visible={showLinkModal}
            editLink={editingLink}
            onClose={() => { setShowLinkModal(false); setEditingLink(null) }}
            onSuccess={editingLink ? handleLinkEdited : handleLinkCreated}
            defaultAutoOpen={false}
          />
        )}

        {contactModalUser && (
          <div className="admin-modal-backdrop" onClick={() => setContactModalUser(null)}>
            <div className="admin-modal" onClick={e => e.stopPropagation()}>
              <h3>Parent Contact</h3>
              <div className="admin-modal-field">
                <label className="admin-modal-label">Parent Name</label>
                <input className="admin-input" placeholder="Jane Doe"
                  value={(parentContacts[contactModalUser] || {}).parent_name || ''}
                  onChange={e => updateContactField(contactModalUser, 'parent_name', e.target.value)} />
              </div>
              <div className="admin-modal-field">
                <label className="admin-modal-label">Phone</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="admin-input" style={{ width: 130, flexShrink: 0 }}
                    value={(parentContacts[contactModalUser] || {}).parent_phone_country || '1'}
                    onChange={e => updateContactField(contactModalUser, 'parent_phone_country', e.target.value)}>
                    {Object.entries(countryCodes).map(([c, v]) => (
                      <option key={c} value={v}>{c} +{v}</option>
                    ))}
                  </select>
                  <input className="admin-input" placeholder="Parent phone" style={{ flex: 1 }}
                    value={(parentContacts[contactModalUser] || {}).parent_phone || ''}
                    onChange={e => updateContactField(contactModalUser, 'parent_phone', e.target.value)} />
                </div>
              </div>
              <div className="admin-modal-field">
                <label className="admin-modal-label">Email</label>
                <input className="admin-input" placeholder="jane.doe@example.com" type="email"
                  value={(parentContacts[contactModalUser] || {}).parent_email || ''}
                  onChange={e => updateContactField(contactModalUser, 'parent_email', e.target.value)} />
              </div>
              <div className="admin-modal-actions">
                <button className="admin-btn-ghost" onClick={() => setContactModalUser(null)}>Cancel</button>
                <button className="admin-btn" onClick={async () => {
                  await saveParentContact(contactModalUser)
                  setContactModalUser(null)
                }}>Save</button>
              </div>
            </div>
          </div>
        )}

        {showOverrideModal && (() => {
          const currentByEmail = currentRecordsForDate(overrideDate)
          const overwritingReal = students.filter(s => {
            const rec = currentByEmail[s.username]
            return overridePresent[s.username] && rec && rec.source === 'linkjoin_click'
          })
          return (
          <div className="admin-modal-backdrop" onClick={() => setShowOverrideModal(false)}>
            <div className="admin-modal" onClick={e => e.stopPropagation()}>
              <h3>Attendance override</h3>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: -8, marginBottom: 16 }}>
                For when automatic tracking didn't run, or to correct a record that's wrong.
                Overrides are appended to the history, not destructive — nothing is deleted.
              </p>
              <div className="admin-modal-field">
                <label className="admin-modal-label">Date</label>
                <input
                  className="admin-input"
                  type="date"
                  value={overrideDate}
                  onChange={e => handleOverrideDateChange(e.target.value)}
                />
              </div>
              <div className="admin-modal-field">
                <label className="admin-modal-label">Select students</label>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {students.map(s => {
                    const rec = currentByEmail[s.username]
                    return (
                      <label
                        key={s.user_id}
                        className="admin-checkbox-row"
                        onClick={() => toggleOverridePresent(s.username)}
                      >
                        <span className={`admin-checkbox${overridePresent[s.username] ? ' admin-checkbox--checked' : ''}`}>
                          {overridePresent[s.username] && <img src="/images/check.svg" alt="" className="admin-checkbox-img" />}
                        </span>
                        {s.username}
                        {rec && rec.source === 'linkjoin_click' && (
                          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>
                            already joined via LinkJoin{rec.opened_at ? ` at ${rec.opened_at.slice(11, 16)}` : ''}
                          </span>
                        )}
                      </label>
                    )
                  })}
                  {students.length === 0 && <div className="admin-empty">No students in this class.</div>}
                </div>
              </div>

              {overwritingReal.length > 0 && (
                <div className="modal-warn" style={{ marginBottom: 12 }}>
                  ⚠ This will replace a real LinkJoin join for {overwritingReal.map(s => s.username).join(', ')}.
                </div>
              )}

              <div className="admin-modal-field">
                <label className="admin-modal-label">Status</label>
                <select className="admin-input" value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </div>

              <div className="admin-modal-field">
                <label className="admin-modal-label">Reason</label>
                <select className="admin-input" value={overrideReasonCode} onChange={e => setOverrideReasonCode(e.target.value)}>
                  <option value="">Select a reason&hellip;</option>
                  {OVERRIDE_REASON_CODES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {overrideReasonCode === 'other' && (
                <div className="admin-modal-field">
                  <label className="admin-modal-label">Note (required)</label>
                  <input
                    className="admin-input"
                    value={overrideNote}
                    onChange={e => setOverrideNote(e.target.value)}
                    placeholder="What happened?"
                  />
                </div>
              )}

              {overrideStatus === 'present' && (
                <div className="admin-modal-field">
                  <label className="admin-modal-label">Join time <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional, if known)</span></label>
                  <input
                    className="admin-input"
                    type="time"
                    value={overrideJoinTime}
                    onChange={e => setOverrideJoinTime(e.target.value)}
                  />
                </div>
              )}

              <div className="admin-modal-actions">
                <button className="admin-btn-ghost" onClick={() => setShowOverrideModal(false)}>Cancel</button>
                <button
                  className="admin-btn"
                  onClick={submitOverride}
                  disabled={overrideSaving || !overrideReasonCode || (overrideReasonCode === 'other' && !overrideNote.trim())}
                >
                  {overrideSaving ? 'Saving…' : 'Save attendance'}
                </button>
              </div>
            </div>
          </div>
          )
        })()}

        {/* Students tab */}
        {classTab === 'students' && <div className="detail-section-card">
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
                    <tr key={s.user_id}>
                      <td>
                        <button className="sp-student-link" onClick={() => onViewStudent?.(s.user_id)}>{s.username}</button>
                      </td>
                      <td style={{ position: 'relative' }}>
                        {(() => {
                          const c = parentContacts[s.user_id]
                          const parents = c?.linked_parents || []
                          const hasParents = parents.length > 0
                          return (
                            <>
                              <button
                                className="roster-contact-btn"
                                style={hasParents ? {} : { opacity: 0.4, cursor: 'default' }}
                                onClick={() => {
                                  if (!hasParents) return
                                  if (parents.length === 1) { navigate(`/admin/parents/${parents[0].user_id}`); return }
                                  setParentPopup(parentPopup === s.user_id ? null : s.user_id)
                                }}
                              >
                                Parent contact
                              </button>
                              {parentPopup === s.user_id && (
                                <div className="parent-popup">
                                  {parents.map(p => (
                                    <button key={p.user_id} className="parent-popup-row" onClick={() => { setParentPopup(null); navigate(`/admin/parents/${p.user_id}`) }}>
                                      <span className="parent-popup-name">{p.name || p.email}</span>
                                      {p.name && <span className="parent-popup-email">{p.email}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </td>
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

          <div className="detail-section-divider" />

          <div className="detail-section-body">
            <div className="join-code-header" onClick={loadJoinCode}>
              <span className="detail-section-label" style={{ fontSize: 13 }}>Student join link</span>
            </div>
            {joinCode === null && !joinCodeLoading && (
              <button className="admin-btn" style={{ marginTop: 8 }} onClick={loadJoinCode}>Show join link</button>
            )}
            {joinCodeLoading && <div className="admin-empty" style={{ padding: '12px 0' }}>Loading...</div>}
            {joinCode !== null && !joinCodeLoading && (
              <div className="join-code-section">
                {joinCode ? (
                  <>
                    <div className="join-code-url">{`${window.location.origin}/join/${joinCode.token}`}</div>
                    <div className="join-code-actions">
                      <button className="admin-btn" onClick={copyJoinLink}>
                        {joinCopied ? 'Copied!' : 'Copy link'}
                      </button>
                      <button className="admin-btn admin-btn--ghost" onClick={generateJoinCode} disabled={joinCodeLoading}>
                        Regenerate
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                      Students can sign up at this link and join this class automatically.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>No active join link. Generate one for students to use.</div>
                    <button className="admin-btn" onClick={generateJoinCode} disabled={joinCodeLoading}>
                      {joinCodeLoading ? '...' : 'Generate join link'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>}

        {/* Attendance tab */}
        {classTab === 'attendance' && <div className="detail-section-card detail-section-card--full">
          <div className="detail-section-header">
            <span className="detail-section-label">Attendance</span>
            <span className="detail-section-count">{attendance.length}</span>
            <button
              className="detail-export-btn"
              onClick={openOverrideModal}
              title="Manually mark students present for a day"
              style={{ marginLeft: 'auto' }}
            >
              Day override
            </button>
            <button
              className="detail-export-btn"
              onClick={handleExportCsv}
              disabled={exporting}
              title="Export CSV — columns (student email, name, class, date, status, minutes late) map directly into PowerSchool's Quick Import or Infinite Campus's Positive Attendance Import Wizard. Note: those tools match students by their SIS student ID, not email, so your first import will need a one-time manual mapping step."
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
                    // opened_at is null on an absent/excused override — fall back to
                    // record_date (always set) so the row doesn't show the 1970 epoch.
                    const dt = new Date(r.opened_at || r.record_date)
                    const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    const timeStr = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                    const tardyThreshold = patterns?.thresholds?.tardy_threshold_minutes ?? 5
                    const late = r.minutes_late
                    const isTardy = !r.absent && late > tardyThreshold
                    let statusLabel, statusClass
                    if (r.absent) {
                      statusLabel = 'Absent'
                      statusClass = 'att-late'
                    } else if (r.excused) {
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
                        <td className="att-email">{(() => {
                          const s = students.find(s => s.username === r.student_email)
                          return s
                            ? <button className="sp-student-link" onClick={() => onViewStudent?.(s.user_id)}>{r.student_email}</button>
                            : r.student_email
                        })()}</td>
                        <td className="att-time">{r.absent ? dateStr : `${dateStr} ${timeStr}`}</td>
                        <td>
                          {r.manual ? (
                            <span className="att-badge att-excused">Manually marked</span>
                          ) : (
                            <span className={`att-badge ${statusClass}`}>{statusLabel}</span>
                          )}
                          {r.excused && <span className="att-badge att-excused" style={{ marginLeft: 4 }}>Excused</span>}
                        </td>
                        <td className="att-action-cell">
                          {r.absent ? (
                            r.excused ? (
                              <button className="att-undo-btn" onClick={() => excuseAbsence(r.student_email, r.record_date || r.opened_at?.slice(0, 10), false)}>Undo</button>
                            ) : (
                              <button className="iv-open-btn" onClick={() => excuseAbsence(r.student_email, r.record_date || r.opened_at?.slice(0, 10), true)}>Excuse</button>
                            )
                          ) : r.excused ? (
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
        </div>}

        {/* Patterns tab */}
        {classTab === 'patterns' && (!patterns ? (
          <div className="detail-section-card detail-section-card--full">
            <div className="detail-section-body"><div className="admin-empty">No pattern data yet. Patterns appear after a few sessions.</div></div>
          </div>
        ) : (
          <div className="detail-section-card detail-section-card--full">
            <div className="detail-section-header">
              <span className="detail-section-label">Patterns</span>
              {(patterns.students || []).filter(s => s.flags.length > 0).length > 0 && (
                <span className="att-flag-count">
                  {(patterns.students || []).filter(s => s.flags.length > 0).length} flagged
                </span>
              )}
              <span className="detail-section-meta">Last {patterns.lookback_days} days · {patterns.expected_count} expected sessions</span>
            </div>
            {patterns.data_quality?.flagged && (
              <div className="modal-warn" style={{ margin: '0 20px 16px' }}>
                ⚠ {Math.round(patterns.data_quality.leak_rate * 100)}% of this class's attendance events
                are joins outside LinkJoin (a "leak"). Tardiness stats below are unreliable for
                sessions with no real timestamp — flags are annotated, not suppressed, below.
              </div>
            )}
            <div className="detail-section-body">
              {(patterns.students || []).length === 0 ? (
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
                    {(patterns.students || []).map((s, i) => {
                      const pct = Math.round(s.attendance_rate * 100)
                      const hasFlags = s.flags.length > 0
                      const effectiveExpected = s.effective_expected ?? patterns.expected_count
                      const missedDates = s.missed_dates || []
                      const excusedAbsenceDates = new Set(s.excused_absence_dates || [])
                      const hasAbsencesToExcuse = missedDates.length > 0 || excusedAbsenceDates.size > 0
                      return (
                        <tr key={i} className={hasFlags ? 'pattern-row--flagged' : ''}>
                          <td className="att-email">
                            <div>
                              {s.student_user_id
                                ? <button className="sp-student-link" onClick={() => onViewStudent?.(s.student_user_id)}>{s.student_email}</button>
                                : s.student_email}
                            </div>
                            {hasAbsencesToExcuse && (
                              <div className="att-excuse-dates">
                                <span className="att-excuse-label">Absences:</span>
                                {missedDates.map(d => (
                                  <button key={d} className="att-date-pill" title="Click to excuse this absence" onClick={() => excuseAbsence(s.student_email, d, true)}>
                                    {d.slice(5)}
                                  </button>
                                ))}
                                {[...excusedAbsenceDates].sort().map(d => (
                                  <button key={d} className="att-date-pill att-date-pill--excused" title="Excused — click to undo" onClick={() => excuseAbsence(s.student_email, d, false)}>
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
                            {(s.flags.length > 0 || (s.reopen_flags || []).length > 0) ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {[...s.flags, ...(s.reopen_flags || [])].map(f => (
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
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              {s.flags.map(f => {
                                const iv = interventionFor(s.student_email, f)
                                const flagClass = f === 'repeat_tardy' ? 'iv-flag--tardy' : 'iv-flag--attendance'
                                if (iv) {
                                  return (
                                    <button key={f} className={`iv-status-pill ${flagClass}`}
                                      onClick={() => setExpandedCase(expandedCase === iv.intervention_id ? null : iv.intervention_id)}>
                                      {iv.status === 'open' ? 'Open' : iv.status === 'in_progress' ? 'In progress' : 'Resolved'}
                                    </button>
                                  )
                                }
                                return (
                                  <button key={f} className={`iv-open-btn ${flagClass}`} onClick={() => openCase(s.student_email, f)}>
                                    Open case
                                  </button>
                                )
                              })}
                              {(s.reopen_flags || []).map(f => (
                                <button key={`reopen-${f}`}
                                  className={`iv-open-btn ${f === 'repeat_tardy' ? 'iv-flag--tardy' : 'iv-flag--attendance'}`}
                                  onClick={() => openCase(s.student_email, f)}>
                                  Reopen case
                                </button>
                              ))}
                              {s.suppressed && (s.flags.length > 0 || (s.reopen_flags || []).length > 0) && (
                                <span title="High leak rate for this class — flags may reflect incomplete data"
                                  style={{ fontSize: 11, opacity: 0.5, alignSelf: 'center' }}>
                                  low confidence
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ))}

        {/* Interventions tab */}
        {classTab === 'interventions' && (
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
                            <div className="iv-input-row">
                              <input
                                className="iv-input"
                                placeholder="staff email"
                                value={assignedDrafts[iv.intervention_id] ?? (iv.assigned_to || '')}
                                onChange={e => setAssignedDrafts(p => ({ ...p, [iv.intervention_id]: e.target.value }))}
                              />
                              <button
                                className={`iv-save-btn${assignedSaved[iv.intervention_id] ? ' iv-save-btn--saved' : ''}`}
                                onClick={async () => {
                                  const val = assignedDrafts[iv.intervention_id] !== undefined
                                    ? assignedDrafts[iv.intervention_id]
                                    : (iv.assigned_to || '')
                                  await updateCase(iv.intervention_id, { assigned_to: val || null })
                                  setAssignedSaved(p => ({ ...p, [iv.intervention_id]: true }))
                                  setTimeout(() => setAssignedSaved(p => ({ ...p, [iv.intervention_id]: false })), 2000)
                                }}
                              >
                                {assignedSaved[iv.intervention_id] ? '✓ Saved' : 'Save'}
                              </button>
                            </div>
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
            {interventions.length === 0 && (
              <div className="detail-section-body"><div className="admin-empty">No open cases for this class.</div></div>
            )}
          </div>
        )}

        {/* Integrations tab */}
        {classTab === 'integrations' && <div className="detail-section-card detail-section-card--full">
          <div className="detail-section-header">
            <span className="detail-section-label">Google Classroom</span>
            {gcConnected && cls.gc_course_id && (
              <span className="gc-connected-badge">Connected</span>
            )}
          </div>
          <div className="detail-section-body gc-section-body">
            {!gcConnected ? (
              <div className="gc-prompt">
                <p className="gc-prompt-text">Connect your Google account to sync attendance scores directly to your Google Classroom gradebook.</p>
                <button className="gc-connect-btn" onClick={handleGcConnect} disabled={gcConnecting}>
                  {gcConnecting ? 'Connecting...' : (
                    <><img src="/images/google-logo.svg" alt="" className="gc-logo-icon" /> Connect Google Classroom</>
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
                  <span className="gc-course-icon"><img src="/images/google-logo.svg" alt="Google" className="gc-logo-icon" /></span>
                  <div className="gc-course-info">
                    <div className="gc-course-name">Google Classroom</div>
                    <div className="gc-course-meta">{cls.gc_course_name}</div>
                  </div>
                  <span className="gc-connected-badge">Connected</span>
                </div>
                <div className="gc-sync-row">
                  <span className="gc-sync-label">
                    {gcSyncResult
                      ? gcSyncResult.ok
                        ? `Last sync: Synced ${gcSyncResult.synced} of ${gcSyncResult.total} students`
                        : 'Last sync failed. Check your connection.'
                      : 'Sync attendance scores to your gradebook.'}
                  </span>
                  <button className="gc-sync-btn" onClick={handleGcSync} disabled={gcSyncing}>
                    {gcSyncing ? 'Syncing...' : 'Sync now'}
                  </button>
                </div>
                <p className="gc-hint">Scores post to the "Attendance" assignment (0–100) in your gradebook.</p>
                <button className="gc-disconnect-btn" onClick={handleGcDisconnect}>Disconnect</button>
              </div>
            )}
          </div>
        </div>}

        {classTab === 'integrations' && (
          <div className="detail-section-card detail-section-card--full" style={{ marginTop: 12 }}>
            <div className="detail-section-header">
              <span className="detail-section-label">Canvas LMS</span>
              {canvasConnected && cls.canvas_course_id && <span className="gc-connected-badge">Connected</span>}
            </div>
            <div className="detail-section-body gc-section-body">
              {!canvasOrgConfigured ? (
                <div className="gc-prompt">
                  <p className="gc-prompt-text">Canvas is not configured for your school. Ask your admin to add Canvas credentials in Organization Settings.</p>
                </div>
              ) : !canvasConnected ? (
                <div className="gc-prompt">
                  <p className="gc-prompt-text">Connect your Canvas account to sync attendance scores directly to your Canvas gradebook.</p>
                  <button className="gc-connect-btn canvas-connect-btn" onClick={handleCanvasConnect} disabled={canvasConnecting}>
                    {canvasConnecting ? 'Connecting...' : (
                      <><img src="/images/lms/canvas.svg" alt="" className="gc-logo-icon" /> Connect Canvas</>
                    )}
                  </button>
                </div>
              ) : !cls.canvas_course_id ? (
                <div className="gc-prompt">
                  <p className="gc-prompt-text">Select which Canvas course maps to this class. Attendance scores will sync to that course's gradebook.</p>
                  <select className="gc-course-select" defaultValue="" onChange={handleCanvasCourseSelect}>
                    <option value="" disabled>Select a course...</option>
                    {canvasCourses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="gc-connected">
                  <div className="gc-course-row">
                    <span className="gc-course-icon"><img src="/images/lms/canvas.svg" alt="Canvas" className="gc-logo-icon" /></span>
                    <div className="gc-course-info">
                      <div className="gc-course-name">Canvas LMS</div>
                      <div className="gc-course-meta">{cls.canvas_course_name}</div>
                    </div>
                    <span className="gc-connected-badge">Connected</span>
                  </div>
                  <div className="gc-sync-row">
                    <span className="gc-sync-label">
                      {canvasSyncResult
                        ? canvasSyncResult.ok
                          ? `Last sync: Synced ${canvasSyncResult.synced} of ${canvasSyncResult.total} students`
                          : 'Last sync failed. Check your connection.'
                        : 'Sync attendance scores to your gradebook.'}
                    </span>
                    <button className="gc-sync-btn" onClick={handleCanvasSync} disabled={canvasSyncing}>
                      {canvasSyncing ? 'Syncing...' : 'Sync now'}
                    </button>
                  </div>
                  <p className="gc-hint">Scores post to the "Attendance" assignment (0–100) in your Canvas gradebook.</p>
                  <button className="gc-disconnect-btn" onClick={handleCanvasDisconnect}>Disconnect</button>
                </div>
              )}
            </div>
          </div>
        )}

        </>}

      </div>
    </div>
  )
}

// ─── Org Settings Tab ─────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  tardy_threshold_minutes: 5,
  tardy_rate_flag: 33,
  attendance_rate_flag: 50,
  min_sessions_to_flag: 3,
  leak_rate_flag: 15,
}

function AlertSettingsCard({ orgId }) {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(DEFAULT_THRESHOLDS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (!orgId) return
    apiGet(`/orgs/${orgId}/attendance-settings`).then(s => {
      const normalized = {
        tardy_threshold_minutes: s.tardy_threshold_minutes,
        tardy_rate_flag: Math.round(s.tardy_rate_flag * 100),
        attendance_rate_flag: Math.round(s.attendance_rate_flag * 100),
        min_sessions_to_flag: s.min_sessions_to_flag,
        leak_rate_flag: Math.round((s.leak_rate_flag ?? 0.15) * 100),
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
    const leakRate = Number(draft.leak_rate_flag)
    if (tardyMin < 0 || tardyMin > 60) return setSaveError('Minutes late must be between 0 and 60.')
    if (tardyRate < 1 || tardyRate > 100) return setSaveError('Tardy rate must be between 1% and 100%.')
    if (attRate < 1 || attRate > 100) return setSaveError('Attendance rate must be between 1% and 100%.')
    if (minSess < 1 || minSess > 20) return setSaveError('Minimum sessions must be between 1 and 20.')
    if (leakRate < 1 || leakRate > 100) return setSaveError('Leak rate must be between 1% and 100%.')
    setSaving(true)
    setSaveError(null)
    try {
      await apiPatch(`/orgs/${orgId}/attendance-settings`, {
        tardy_threshold_minutes: tardyMin,
        tardy_rate_flag: tardyRate / 100,
        attendance_rate_flag: attRate / 100,
        min_sessions_to_flag: minSess,
        leak_rate_flag: leakRate / 100,
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
    draft.min_sessions_to_flag !== settings.min_sessions_to_flag ||
    draft.leak_rate_flag !== settings.leak_rate_flag
  )

  return (
    <div className="alert-settings-card">
      <div className="org-settings-section-title">Alert Settings</div>
      <div className="alert-settings-body">
        <div className="alert-settings-grid">
          <label className="alert-settings-label">
            Minutes late to count as tardy
            <input type="number" className="alert-settings-input" min={0} max={60}
              value={draft.tardy_threshold_minutes}
              onChange={e => handleChange('tardy_threshold_minutes', e.target.value)} />
          </label>
          <label className="alert-settings-label">
            Flag when tardy rate exceeds (%)
            <input type="number" className="alert-settings-input" min={1} max={100}
              value={draft.tardy_rate_flag}
              onChange={e => handleChange('tardy_rate_flag', e.target.value)} />
          </label>
          <label className="alert-settings-label">
            Flag when attendance falls below (%)
            <input type="number" className="alert-settings-input" min={1} max={100}
              value={draft.attendance_rate_flag}
              onChange={e => handleChange('attendance_rate_flag', e.target.value)} />
          </label>
          <label className="alert-settings-label">
            Minimum sessions before flagging
            <input type="number" className="alert-settings-input" min={1} max={20}
              value={draft.min_sessions_to_flag}
              onChange={e => handleChange('min_sessions_to_flag', e.target.value)} />
          </label>
          <label className="alert-settings-label">
            Flag classes when leak rate exceeds (%)
            <input type="number" className="alert-settings-input" min={1} max={100}
              value={draft.leak_rate_flag}
              onChange={e => handleChange('leak_rate_flag', e.target.value)} />
          </label>
        </div>
        <div className="alert-settings-footer">
          {saveError && <span className="alert-settings-error">{saveError}</span>}
          {saved && !dirty && !saveError && <span className="alert-settings-saved">Saved</span>}
          <button className="admin-btn" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AcademicCalendarCard({ orgId }) {
  const [dates, setDates] = useState([])
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const [summerStart, setSummerStart] = useState('')
  const [summerEnd, setSummerEnd] = useState('')
  const [summerSaving, setSummerSaving] = useState(false)
  const [summerErr, setSummerErr] = useState('')
  const [icalUrl, setIcalUrl] = useState('')
  const [icalImporting, setIcalImporting] = useState(false)
  const [icalResult, setIcalResult] = useState(null)
  const [icalErr, setIcalErr] = useState('')

  useEffect(() => {
    if (!orgId) return
    apiGet(`/orgs/${orgId}/calendar`).then(r => {
      setDates(r.blackout_dates || [])
      setSummerStart(r.summer_start || '')
      setSummerEnd(r.summer_end || '')
      setIcalUrl(r.ical_url || '')
    }).catch(() => {})
  }, [orgId])

  async function handleIcalImport() {
    if (!icalUrl.trim()) return
    setIcalImporting(true)
    setIcalErr('')
    setIcalResult(null)
    try {
      const r = await apiPost(`/orgs/${orgId}/calendar/ical`, { url: icalUrl.trim() })
      setIcalResult(r)
      // Refresh the full calendar to show imported dates
      const cal = await apiGet(`/orgs/${orgId}/calendar`)
      setDates(cal.blackout_dates || [])
      setSummerStart(cal.summer_start || '')
      setSummerEnd(cal.summer_end || '')
    } catch (e) {
      setIcalErr(e.message || 'Import failed')
    } finally {
      setIcalImporting(false)
    }
  }

  async function handleSummerSave() {
    setSummerSaving(true)
    setSummerErr('')
    try {
      await apiPut(`/orgs/${orgId}/calendar/summer`, { summer_start: summerStart, summer_end: summerEnd })
    } catch (e) {
      setSummerErr(e.message || 'Failed to save')
    } finally {
      setSummerSaving(false)
    }
  }

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

  const grouped = {}
  for (const d of dates) {
    const dt = new Date(d + 'T12:00:00')
    const label = dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(d)
  }

  return (
    <div className="alert-settings-card">
      <div className="org-settings-section-title">
        Academic Calendar
        {dates.length > 0 && <span className="cal-badge">{dates.length} day{dates.length !== 1 ? 's' : ''} off</span>}
      </div>
      <div className="alert-settings-body">
        <div className="cal-desc">
          Mark school holidays and snow days. These dates are excluded from expected attendance counts so absent students aren't flagged for days school wasn't in session.
        </div>
        <div id="admin-section-ical" className="cal-section-label">Import from Calendar URL</div>
        <div className="cal-ical-row">
          <input
            type="url"
            className="alert-settings-input cal-ical-input"
            placeholder="https://calendar.google.com/…/basic.ics"
            value={icalUrl}
            onChange={e => { setIcalUrl(e.target.value); setIcalErr(''); setIcalResult(null) }}
            onKeyDown={e => e.key === 'Enter' && handleIcalImport()}
          />
          <button className="admin-btn" onClick={handleIcalImport} disabled={icalImporting || !icalUrl.trim()}>
            {icalImporting ? 'Importing…' : 'Import'}
          </button>
        </div>
        <div className="cal-ical-hint">Paste your district's iCal (.ics) URL. Holidays, breaks, and no-school days are detected automatically.</div>
        {icalResult && (
          <div className="cal-ical-result">
            {icalResult.imported_dates > 0 && <span>Added {icalResult.imported_dates} day{icalResult.imported_dates !== 1 ? 's' : ''} off.</span>}
            {icalResult.summer_start && <span> Summer break: {icalResult.summer_start.slice(5)} – {icalResult.summer_end.slice(5)}.</span>}
            {icalResult.imported_dates === 0 && !icalResult.summer_start && <span>No no-school events found — check the URL or try a different feed.</span>}
          </div>
        )}
        {icalErr && <div className="alert-settings-error" style={{ marginBottom: 8 }}>{icalErr}</div>}
        <div id="admin-section-summer" className="cal-section-label" style={{ marginTop: 16 }}>Summer Break</div>
        <div className="cal-summer-row">
          <input
            type="date"
            className="alert-settings-input cal-date-input"
            value={summerStart}
            onChange={e => { setSummerStart(e.target.value); setSummerErr('') }}
          />
          <span className="cal-summer-to">to</span>
          <input
            type="date"
            className="alert-settings-input cal-date-input"
            value={summerEnd}
            onChange={e => { setSummerEnd(e.target.value); setSummerErr('') }}
          />
          <button className="admin-btn" onClick={handleSummerSave} disabled={summerSaving}>
            {summerSaving ? '…' : 'Save'}
          </button>
        </div>
        {summerErr && <div className="alert-settings-error" style={{ marginBottom: 8 }}>{summerErr}</div>}
        <div className="cal-section-label">Individual Days Off</div>
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
    </div>
  )
}

function CleverRosterCard({ orgId }) {
  const [status, setStatus] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  useEffect(() => {
    if (!orgId) { setStatus({ connected: false }); return }
    apiGet(`/integrations/clever/status?org_id=${orgId}`)
      .then(r => setStatus(r))
      .catch(() => setStatus({ connected: false }))
  }, [orgId])

  async function handleConnect() {
    setConnecting(true)
    try {
      const { url } = await apiGet('/integrations/clever/authorize-url')
      const popup = window.open(url, 'clever-oauth', 'width=520,height=640')
      await new Promise((resolve, reject) => {
        const handler = e => {
          if (e.data?.clever === 'connected') { window.removeEventListener('message', handler); resolve() }
          if (e.data?.clever === 'error') { window.removeEventListener('message', handler); reject(new Error('OAuth error')) }
        }
        window.addEventListener('message', handler)
        const timer = setInterval(() => { if (popup?.closed) { clearInterval(timer); reject(new Error('Closed')) } }, 500)
      })
      const r = await apiGet(`/integrations/clever/status?org_id=${orgId}`)
      setStatus(r)
    } catch { /* user closed popup */ }
    setConnecting(false)
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await apiPost(`/integrations/clever/sync/${orgId}`)
      setSyncResult({ ok: true, ...res })
      const r = await apiGet(`/integrations/clever/status?org_id=${orgId}`)
      setStatus(r)
    } catch (e) {
      const detail = e?.detail || e?.message || 'Sync failed'
      setSyncResult({ ok: false, message: typeof detail === 'string' ? detail : 'Sync failed' })
    }
    setSyncing(false)
  }

  async function handleDisconnect() {
    await apiDelete(`/integrations/clever/disconnect/${orgId}`)
    setStatus({ connected: false })
    setSyncResult(null)
  }

  function syncLabel() {
    if (syncResult) {
      if (!syncResult.ok) return syncResult.message
      const parts = [`Synced ${syncResult.students} student${syncResult.students !== 1 ? 's' : ''} across ${syncResult.sections} class${syncResult.sections !== 1 ? 'es' : ''}`]
      if (syncResult.new_classes > 0) parts.push(`${syncResult.new_classes} new class${syncResult.new_classes !== 1 ? 'es' : ''} created`)
      return parts.join(' · ')
    }
    if (status?.last_sync_stats) {
      const s = status.last_sync_stats
      return `Last sync: ${s.students} student${s.students !== 1 ? 's' : ''} across ${s.sections} class${s.sections !== 1 ? 'es' : ''}`
    }
    return 'No syncs yet'
  }

  return (
    <div className="alert-settings-card" style={{ marginTop: 16 }}>
      <div className="org-settings-section-title">Clever</div>
      <div className="alert-settings-body">
        {status === null ? (
          <div className="admin-spinner-wrap--inline" style={{ display: 'flex', padding: '16px 0' }}><div className="admin-spinner" /></div>
        ) : !status.connected ? (
          <div className="clever-connect-state">
            <p className="clever-hint">
              Connect Clever to auto-populate your class rosters from your district SIS.
            </p>
            <button className="clever-connect-btn" onClick={handleConnect} disabled={connecting}>
              <img src="/images/lms/clever.svg" alt="" className="clever-logo" />
              {connecting ? 'Connecting...' : 'Connect Clever'}
            </button>
          </div>
        ) : (
          <div className="clever-connected">
            <div className="clever-row">
              <div className="clever-icon">
                <img src="/images/lms/clever.svg" alt="Clever" className="clever-logo-sm" />
              </div>
              <div className="gc-course-info">
                <div className="gc-course-name">Clever</div>
                {status.district_name && <div className="gc-course-meta">{status.district_name}</div>}
              </div>
              <span className="gc-connected-badge">Connected</span>
            </div>
            <div className="gc-sync-row">
              <span className={`gc-sync-label${syncResult && !syncResult.ok ? ' gc-sync-label--err' : ''}`}>
                {syncLabel()}
              </span>
              <button className="gc-sync-btn" onClick={handleSync} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync now'}
              </button>
            </div>
            <p className="gc-hint">Class rosters update automatically. Students claim their accounts on first login.</p>
            <button className="gc-disconnect-btn" onClick={handleDisconnect}>Disconnect</button>
          </div>
        )}
      </div>
    </div>
  )
}

const ADMIN_SEARCH_INDEX = [
  { label: 'Teachers', hint: 'View and manage teacher classes', tab: 'teachers', scroll: null, keywords: ['staff', 'class', 'roster'] },
  { label: 'Interventions', hint: 'At-risk students and open cases', tab: 'interventions', scroll: null, keywords: ['at-risk', 'flag', 'case', 'counselor'] },
  { label: 'Meeting Log', hint: 'History of all meeting opens', tab: 'log', scroll: null, keywords: ['history', 'log', 'meeting', 'open'] },
  { label: 'Organization Settings', hint: 'School name, alerts, academic calendar', tab: 'org', scroll: null, keywords: ['settings', 'school', 'config'] },
  { label: 'Notification Display Name', hint: 'School name shown in absence alert texts and emails', tab: 'org', scroll: 'admin-section-display-name', keywords: ['brand', 'school name', 'sms', 'email', 'text'] },
  { label: 'Alert Settings', hint: 'Tardy threshold, attendance rate flags, minimum sessions', tab: 'org', scroll: 'admin-section-alerts', keywords: ['tardy', 'threshold', 'flag', 'absent', 'rate', 'minutes', 'sessions'] },
  { label: 'Academic Calendar', hint: 'Holidays, snow days, and blackout dates', tab: 'org', scroll: 'admin-section-calendar', keywords: ['holiday', 'blackout', 'snow day', 'days off', 'calendar'] },
  { label: 'Import Calendar URL', hint: 'Auto-import holidays from iCal / Google Calendar', tab: 'org', scroll: 'admin-section-ical', keywords: ['ical', 'ics', 'google calendar', 'import', 'url', 'subscribe'] },
  { label: 'Summer Break', hint: 'Set summer start and end dates', tab: 'org', scroll: 'admin-section-summer', keywords: ['summer', 'break', 'vacation', 'end of year', 'start of year'] },
  { label: 'Clever', hint: 'Connect Clever to import student rosters', tab: 'integrations', scroll: 'admin-section-roster', keywords: ['clever', 'roster', 'sync', 'students', 'sis'] },
  { label: 'OneRoster', hint: 'Connect PowerSchool, Infinite Campus, Skyward, or ClassLink via OneRoster', tab: 'integrations', scroll: 'admin-section-oneroster', keywords: ['oneroster', 'one roster', 'powerschool', 'infinite campus', 'skyward', 'classlink', 'class link', 'sis', 'roster'] },
  { label: 'Schoology', hint: 'Connect Schoology to sync class rosters', tab: 'integrations', scroll: 'admin-section-schoology', keywords: ['schoology', 'lms', 'roster', 'sync', 'students'] },
  { label: 'Canvas', hint: 'Configure Canvas gradebook sync for teachers', tab: 'integrations', scroll: 'admin-section-canvas', keywords: ['canvas', 'lms', 'gradebook', 'instructure', 'grades', 'lms sync'] },
]

function AdminSearch({ extraIndex, onClose, onNavigate }) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const index = [...ADMIN_SEARCH_INDEX, ...(extraIndex || [])]

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = q.trim()
    ? index.filter(item => {
        const haystack = [item.label, item.hint, ...(item.keywords || [])].join(' ').toLowerCase()
        return q.trim().toLowerCase().split(/\s+/).every(word => haystack.includes(word))
      }).slice(0, 8)
    : ADMIN_SEARCH_INDEX.slice(0, 6)

  function handleKey(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && results[cursor]) { onNavigate(results[cursor]); onClose() }
  }

  return (
    <div className="admin-search-overlay" onMouseDown={onClose}>
      <div className="admin-search-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="admin-search-input-row">
          <span className="admin-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="admin-search-input"
            placeholder="Search admin dashboard…"
            value={q}
            onChange={e => { setQ(e.target.value); setCursor(0) }}
            onKeyDown={handleKey}
          />
          <kbd className="admin-search-esc" onClick={onClose}>esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="admin-search-results">
            {results.map((item, i) => (
              <button
                key={i}
                className={`admin-search-result${cursor === i ? ' admin-search-result--active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => { onNavigate(item); onClose() }}
              >
                <span className="admin-search-result-label">{item.label}</span>
                <span className="admin-search-result-hint">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
        {results.length === 0 && q.trim() && (
          <div className="admin-search-empty">No results for "{q}"</div>
        )}
      </div>
    </div>
  )
}

function OneRosterCard({ orgId }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ base_url: '', client_id: '', client_secret: '' })
  const [connecting, setConnecting] = useState(false)
  const [connectErr, setConnectErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  useEffect(() => {
    if (!orgId) return
    apiGet(`/integrations/oneroster/status?org_id=${orgId}`)
      .then(r => {
        setStatus(r)
        if (r.connected) setForm(f => ({ ...f, base_url: r.base_url || '' }))
      })
      .catch(() => setStatus({ connected: false }))
  }, [orgId])

  async function handleConnect(e) {
    e.preventDefault()
    setConnecting(true)
    setConnectErr('')
    try {
      const r = await apiPost('/integrations/oneroster/connect', form)
      setStatus({ connected: true, district_name: r.district_name, base_url: form.base_url })
    } catch (e) {
      setConnectErr(e.message || 'Could not connect. Check your credentials and base URL.')
    } finally {
      setConnecting(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await apiPost(`/integrations/oneroster/sync/${orgId}`)
      setSyncResult({ ok: true, ...res })
      const r = await apiGet(`/integrations/oneroster/status?org_id=${orgId}`)
      setStatus(r)
    } catch (e) {
      setSyncResult({ ok: false, message: e.message || 'Sync failed' })
    }
    setSyncing(false)
  }

  async function handleDisconnect() {
    await apiDelete(`/integrations/oneroster/disconnect/${orgId}`)
    setStatus({ connected: false })
    setSyncResult(null)
    setForm({ base_url: '', client_id: '', client_secret: '' })
  }

  function syncLabel() {
    if (syncResult) {
      if (!syncResult.ok) return syncResult.message
      const parts = [`Synced ${syncResult.students} student${syncResult.students !== 1 ? 's' : ''} across ${syncResult.sections} class${syncResult.sections !== 1 ? 'es' : ''}`]
      if (syncResult.new_classes > 0) parts.push(`${syncResult.new_classes} new`)
      return parts.join(' · ')
    }
    if (status?.last_sync_stats) {
      const s = status.last_sync_stats
      return `Last sync: ${s.students} student${s.students !== 1 ? 's' : ''} across ${s.sections} class${s.sections !== 1 ? 'es' : ''}`
    }
    return 'No syncs yet'
  }

  if (status === null) return null

  return (
    <div className="alert-settings-card" style={{ marginTop: 16 }}>
      <div className="org-settings-section-title">OneRoster</div>
      <div className="alert-settings-body">
        {!status.connected ? (
          <>
            <div className="clever-row" style={{ marginBottom: 8 }}>
              <img src="/images/lms/oneroster.png" alt="" className="clever-logo-sm" />
              <img src="/images/lms/classlink.png" alt="" className="clever-logo-sm" />
            </div>
            <p className="clever-connect-desc">Connect your district's OneRoster-compatible SIS or rostering provider (PowerSchool, Infinite Campus, Skyward, ClassLink Roster Server) to auto-populate class rosters.</p>
            <form className="or-connect-form" onSubmit={handleConnect}>
              <div className="or-field">
                <label className="or-label">API Base URL</label>
                <input
                  className="alert-settings-input"
                  placeholder="https://district.powerschool.com/ims/oneroster/v1p1"
                  value={form.base_url}
                  onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                  required
                />
              </div>
              <div className="or-field-row">
                <div className="or-field">
                  <label className="or-label">Client ID</label>
                  <input
                    className="alert-settings-input"
                    placeholder="client_id"
                    value={form.client_id}
                    onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                    required
                  />
                </div>
                <div className="or-field">
                  <label className="or-label">Client Secret</label>
                  <input
                    className="alert-settings-input"
                    type="password"
                    placeholder="client_secret"
                    value={form.client_secret}
                    onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))}
                    required
                  />
                </div>
              </div>
              {connectErr && <div className="alert-settings-error" style={{ marginBottom: 8 }}>{connectErr}</div>}
              <button className="admin-btn or-connect-btn" type="submit" disabled={connecting}>
                {connecting ? 'Connecting…' : 'Test & Connect'}
              </button>
            </form>
            <p className="or-hint">Credentials are provided by your district IT department from your SIS admin console.</p>
          </>
        ) : (
          <div className="clever-connected">
            <div className="clever-row">
              <span className="clever-icon or-icon">OR</span>
              <div className="clever-info">
                <div className="clever-name">OneRoster</div>
                <div className="clever-district">{status.district_name || status.base_url}</div>
              </div>
              <span className="gc-connected-badge">Connected</span>
            </div>
            <div className="gc-sync-row">
              <span className={`gc-sync-label${syncResult && !syncResult.ok ? ' gc-sync-label--err' : ''}`}>{syncLabel()}</span>
              <button className="gc-sync-btn" onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
            </div>
            <p className="gc-hint">Students are added by email and claim their account on first login.</p>
            <button className="gc-disconnect-btn" onClick={handleDisconnect}>Disconnect</button>
          </div>
        )}
      </div>
    </div>
  )
}

function CanvasConfigCard({ orgId }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ base_url: '', client_id: '', client_secret: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    if (!orgId) return
    apiGet('/integrations/canvas/org-config')
      .then(r => {
        setStatus(r)
        if (r.configured) setForm(f => ({ ...f, base_url: r.base_url || '' }))
      })
      .catch(() => setStatus({ configured: false }))
  }, [orgId])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveErr('')
    setSaved(false)
    try {
      await apiPost('/integrations/canvas/org-config', form)
      setStatus({ configured: true, base_url: form.base_url })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveErr(err.message || 'Could not save Canvas credentials.')
    } finally {
      setSaving(false)
    }
  }

  if (status === null) return null

  return (
    <div className="alert-settings-card" style={{ marginTop: 16 }}>
      <div className="org-settings-section-title">Canvas</div>
      <div className="alert-settings-body">
        <p className="clever-connect-desc">
          {status.configured
            ? 'Canvas is configured. Teachers can connect their Canvas account from the class Integrations tab.'
            : 'Enter your school\'s Canvas developer key credentials so teachers can sync attendance grades to Canvas.'}
        </p>
        <form className="or-connect-form" onSubmit={handleSave}>
          <div className="or-field">
            <label className="or-label">Canvas Base URL</label>
            <input
              className="alert-settings-input"
              placeholder="https://yourschool.instructure.com"
              value={form.base_url}
              onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
              required
            />
          </div>
          <div className="or-field-row">
            <div className="or-field">
              <label className="or-label">Client ID</label>
              <input
                className="alert-settings-input"
                placeholder="client_id"
                value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                required={!status.configured}
              />
            </div>
            <div className="or-field">
              <label className="or-label">Client Secret</label>
              <input
                className="alert-settings-input"
                type="password"
                placeholder="client_secret"
                value={form.client_secret}
                onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))}
                required={!status.configured}
              />
            </div>
          </div>
          {saveErr && <div className="alert-settings-error" style={{ marginBottom: 8 }}>{saveErr}</div>}
          <button className="admin-btn or-connect-btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : status.configured ? 'Update Credentials' : 'Save & Enable'}
          </button>
        </form>
        <p className="or-hint">Developer key credentials are created in your Canvas admin panel under Developer Keys.</p>
      </div>
    </div>
  )
}

function SchoologyCard({ orgId }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ consumer_key: '', consumer_secret: '' })
  const [connecting, setConnecting] = useState(false)
  const [connectErr, setConnectErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  useEffect(() => {
    apiGet(`/integrations/schoology/status?org_id=${orgId}`)
      .then(r => setStatus(r))
      .catch(() => setStatus({ connected: false }))
  }, [orgId])

  async function handleConnect(e) {
    e.preventDefault()
    setConnecting(true); setConnectErr('')
    try {
      const r = await apiPost('/integrations/schoology/connect', { org_id: orgId, ...form })
      setStatus({ connected: true, building_name: r.building_name, last_sync_at: null, last_sync_stats: null })
      setForm({ consumer_key: '', consumer_secret: '' })
    } catch (err) {
      setConnectErr(err?.message || 'Connection failed')
    }
    setConnecting(false)
  }

  async function handleSync() {
    setSyncing(true); setSyncResult(null)
    try {
      const res = await apiPost(`/integrations/schoology/sync/${orgId}`)
      setSyncResult({ ok: true, ...res })
      const r = await apiGet(`/integrations/schoology/status?org_id=${orgId}`)
      setStatus(r)
    } catch (err) {
      setSyncResult({ ok: false, message: err?.message || 'Sync failed' })
    }
    setSyncing(false)
  }

  async function handleDisconnect() {
    await apiDelete(`/integrations/schoology/disconnect/${orgId}`)
    setStatus({ connected: false })
    setSyncResult(null)
  }

  if (!status) return null

  return (
    <div className="alert-settings-card" style={{ marginTop: 16 }}>
      <div className="org-settings-section-title">Schoology</div>
      <div className="alert-settings-body">
        {!status.connected ? (
          <form className="or-connect-form" onSubmit={handleConnect}>
            <p className="or-hint">
              Connect Schoology to auto-populate your class rosters. Get your Consumer Key and
              Secret from your Schoology school app settings under Platform &gt; App Center &gt; API.
            </p>
            <div className="or-field">
              <label className="or-label">Consumer Key</label>
              <input
                className="admin-input"
                value={form.consumer_key}
                onChange={e => setForm(f => ({ ...f, consumer_key: e.target.value }))}
                placeholder="e.g. ab1cd2ef3gh4"
                required
              />
            </div>
            <div className="or-field">
              <label className="or-label">Consumer Secret</label>
              <input
                className="admin-input"
                type="password"
                value={form.consumer_secret}
                onChange={e => setForm(f => ({ ...f, consumer_secret: e.target.value }))}
                placeholder="Your app secret"
                required
              />
            </div>
            {connectErr && <div style={{ color: '#f87171', fontSize: 13 }}>{connectErr}</div>}
            <button
              className="admin-btn or-connect-btn"
              type="submit"
              disabled={connecting || !form.consumer_key || !form.consumer_secret}
            >
              {connecting ? 'Connecting...' : 'Test & Connect'}
            </button>
            <p className="or-hint" style={{ marginTop: 8 }}>
              Credentials are provided by your Schoology district/school administrator.
            </p>
          </form>
        ) : (
          <>
            <div className="clever-row">
              <div className="clever-icon">
                <img src="/images/lms/schoology.png" alt="Schoology" className="clever-logo-sm" />
              </div>
              <div className="clever-info">
                <div className="clever-name">Schoology</div>
                {status.building_name && <div className="clever-district">{status.building_name}</div>}
              </div>
              <span className="gc-connected-badge">Connected</span>
            </div>
            <div className="gc-sync-row">
              <span className={`gc-sync-label${syncResult && !syncResult.ok ? ' gc-sync-label--err' : ''}`}>
                {syncResult
                  ? (syncResult.ok
                    ? `${syncResult.students} students across ${syncResult.sections} sections`
                    : syncResult.message)
                  : status.last_sync_stats
                    ? `Last sync: ${status.last_sync_stats.students} students, ${status.last_sync_stats.sections} sections`
                    : 'Ready to sync'}
              </span>
              <button className="gc-sync-btn" onClick={handleSync} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync now'}
              </button>
            </div>
            <p className="gc-hint">Students are added by email and claim their account on first login.</p>
            <button className="gc-disconnect-btn" onClick={handleDisconnect}>Disconnect</button>
          </>
        )}
      </div>
    </div>
  )
}

function OrgSettingsTab({ orgId, orgName, setOrgName, orgNameSaved, saveOrgName, brandName, setBrandName, brandSaved, saveBrandName }) {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="org-brand-section" style={{ marginTop: 0, marginBottom: 16 }}>
        <div className="org-brand-label">Organization name</div>
        <div className="org-brand-row">
          <input className="admin-input" placeholder="e.g. Lincoln High School"
            value={orgName} onChange={e => setOrgName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveOrgName()} />
          <button className="admin-btn" onClick={saveOrgName}>
            {orgNameSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
      <div id="admin-section-display-name" className="org-brand-section" style={{ marginBottom: 16 }}>
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
      <div id="admin-section-alerts"><AlertSettingsCard orgId={orgId} /></div>
      <div id="admin-section-calendar"><AcademicCalendarCard orgId={orgId} /></div>
    </div>
  )
}

function OrgIntegrationsTab({ orgId }) {
  return (
    <div className="org-settings-root">
      <div id="admin-section-roster">
        <CleverRosterCard orgId={orgId} />
        <div id="admin-section-oneroster"><OneRosterCard orgId={orgId} /></div>
        <div id="admin-section-schoology"><SchoologyCard orgId={orgId} /></div>
        <div id="admin-section-canvas"><CanvasConfigCard orgId={orgId} /></div>
      </div>
    </div>
  )
}

// ─── Teacher View ─────────────────────────────────────────────────────────────

function TeacherView() {
  const navigate = useNavigate()
  const classMatch = useMatch('/admin/class/:classId')
  const studentMatch = useMatch('/admin/students/:userId')
  const parentMatch = useMatch('/admin/parents/:parentId')
  const urlClassId = classMatch?.params?.classId ?? null
  const urlUserId = studentMatch?.params?.userId ?? null
  const urlParentId = parentMatch?.params?.parentId ?? null

  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('classes')

  useEffect(() => {
    apiGet('/classes').then(cls => setClasses(cls)).finally(() => setLoading(false))
  }, [])

  function handleUpdate(fresh) {
    setClasses(prev => prev.map(c => c.class_id === fresh.class_id ? fresh : c))
  }

  if (urlParentId) {
    return (
      <ParentProfile
        userId={urlParentId}
        onBack={() => navigate(-1)}
        onOpenStudent={id => navigate(`/admin/students/${id}`)}
      />
    )
  }

  if (urlUserId) {
    return (
      <StudentProfile
        userId={urlUserId}
        onBack={() => navigate(-1)}
        onOpenClass={classId => navigate(`/admin/class/${classId}`)}
        onOpenIntervention={(classId, ivId) => navigate(`/admin/class/${classId}`, { state: { tab: 'interventions', expandedCase: ivId } })}
        onOpenParent={parentId => navigate(`/admin/parents/${parentId}`)}
      />
    )
  }

  if (loading) return <div className="admin-spinner-wrap"><div className="admin-spinner" /></div>

  const selected = urlClassId ? classes.find(c => c.class_id === urlClassId) ?? null : null

  if (selected) {
    return (
      <ClassDetail
        cls={selected}
        onBack={() => navigate(-1)}
        onUpdate={handleUpdate}
        onViewStudent={id => navigate(`/admin/students/${id}`)}
      />
    )
  }

  return (
    <>
      <div className="admin-tabs">
        {[['classes', 'Classes'], ['log', 'Open Log'], ['interventions', 'Interventions'], ['audit', 'Audit Log']].map(([key, label]) => (
          <button key={key} className={`admin-tab${activeTab === key ? ' admin-tab--active' : ''}`}
            onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'classes' && (
        <div className="class-grid" style={{ marginTop: 20 }}>
          {classes.length === 0 && (
            <div className="admin-empty" style={{ gridColumn: '1 / -1', padding: '48px 0' }}>
              No classes yet. Your school admin will assign you to a class.
            </div>
          )}
          {classes.map(cls => (
            <div key={cls.class_id} className="class-card" onClick={() => navigate(`/admin/class/${cls.class_id}`)}>
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
      )}

      {activeTab === 'log' && <HistoryPanel />}

      {activeTab === 'interventions' && <OrgInterventionList />}

      {activeTab === 'audit' && <AuditLogTab />}
    </>
  )
}

const ACTION_FILTERS = [
  { value: '', label: 'All events' },
  { value: 'auth', label: 'Auth' },
  { value: 'admin', label: 'Admin' },
  { value: 'consent', label: 'Consent' },
  { value: 'data', label: 'Data' },
  { value: 'user', label: 'User' },
]

function AuditLogTab() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const limit = 50

  const load = useCallback(async (pg = 1, act = action) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: pg, limit })
      if (act) qs.set('action', act)
      const data = await apiGet(`/admin/audit-logs?${qs}`)
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPage(pg)
    } catch (_) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [action]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1, action) }, [action]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport() {
    setExporting(true)
    try {
      const qs = new URLSearchParams()
      if (action) qs.set('action', action)
      const res = await fetch(`/admin/audit-logs/export.csv?${qs}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('lj_token')}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'audit-log.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (_) {
      // silent
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="audit-log-wrap">
      <div className="audit-log-toolbar">
        <select
          className="audit-log-filter"
          value={action}
          onChange={e => setAction(e.target.value)}
        >
          {ACTION_FILTERS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button className="audit-log-export" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {loading ? (
        <div className="audit-log-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="audit-log-empty">No audit events found.</div>
      ) : (
        <table className="audit-log-table">
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Event</th>
              <th>User</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td className="audit-log-ts">{new Date(item.ts).toLocaleString()}</td>
                <td><span className="audit-log-action">{item.action}</span></td>
                <td className="audit-log-user">{item.user}</td>
                <td className="audit-log-ip">{item.ip || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="audit-log-pagination">
          <button className="audit-log-page-btn" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
          <span className="audit-log-page-info">Page {page} of {totalPages}</span>
          <button className="audit-log-page-btn" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}

// ─── Intervention case detail panel (shared between standard and My views) ────

function IvDetailPanel({ iv, updateCase, addNote, deleteNote, noteInputs, setNoteInputs, assignedDrafts, setAssignedDrafts, assignedSaved, setAssignedSaved, studentProfile }) {
  const classSummary = studentProfile?.classes?.find(c => c.class_id === iv.class_id)
  const attendanceRow = studentProfile?._attendanceRow
  const parent = studentProfile?.parent

  return (
    <div className="iv-detail">

      {iv.student_user_id && studentProfile === undefined && (
        <div className="iv-mine-section" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading student info…</div>
      )}

      {studentProfile && (
        <>
          <div className="iv-mine-section">
            <div className="iv-mine-section-title">Student</div>
            <div className="iv-mine-fields">
              <div className="iv-mine-field"><span className="iv-mine-label">Email</span><span className="iv-mine-value">{studentProfile.email}</span></div>
              {iv.class_name && <div className="iv-mine-field"><span className="iv-mine-label">Class</span><span className="iv-mine-value">{iv.class_name}</span></div>}
              {studentProfile.joined_at && (
                <div className="iv-mine-field"><span className="iv-mine-label">Joined</span><span className="iv-mine-value">{new Date(studentProfile.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
              )}
            </div>
          </div>

          {(classSummary || attendanceRow) && (
            <div className="iv-mine-section">
              <div className="iv-mine-section-title">Attendance</div>
              <div className="iv-mine-fields">
                {attendanceRow && <div className="iv-mine-field"><span className="iv-mine-label">Expected</span><span className="iv-mine-value">{attendanceRow.effective_expected}</span></div>}
                <div className="iv-mine-field"><span className="iv-mine-label">Attended</span><span className="iv-mine-value">{attendanceRow?.sessions ?? classSummary?.sessions}</span></div>
                {attendanceRow && (
                  <div className="iv-mine-field">
                    <span className="iv-mine-label">Rate</span>
                    <span className="iv-mine-value" style={{ color: attendanceRow.attendance_rate < 0.75 ? '#f0c040' : 'inherit' }}>
                      {Math.round(attendanceRow.attendance_rate * 100)}%
                    </span>
                  </div>
                )}
                <div className="iv-mine-field"><span className="iv-mine-label">On time</span><span className="iv-mine-value">{attendanceRow?.on_time ?? classSummary?.on_time}</span></div>
                <div className="iv-mine-field"><span className="iv-mine-label">Tardy</span><span className="iv-mine-value" style={{ color: (attendanceRow?.tardy ?? classSummary?.tardy ?? 0) > 0 ? '#ff6b6b' : 'inherit' }}>{attendanceRow?.tardy ?? classSummary?.tardy}</span></div>
              </div>
            </div>
          )}

          <div className="iv-mine-section">
            <div className="iv-mine-section-title">Parent contact</div>
            {(parent?.name || parent?.email || parent?.phone) ? (
              <div className="iv-mine-fields">
                {parent.name && <div className="iv-mine-field"><span className="iv-mine-label">Name</span><span className="iv-mine-value">{parent.name}</span></div>}
                {parent.email && <div className="iv-mine-field"><span className="iv-mine-label">Email</span><a className="iv-mine-value iv-mine-link" href={`mailto:${parent.email}`}>{parent.email}</a></div>}
                {parent.phone && <div className="iv-mine-field"><span className="iv-mine-label">Phone</span><span className="iv-mine-value">+{parent.phone_country || '1'} {parent.phone}</span></div>}
              </div>
            ) : (
              <div className="iv-mine-field" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No parent contact on file.</div>
            )}
          </div>
        </>
      )}

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
          <div className="iv-input-row">
            <input
              className="iv-input"
              placeholder="staff email"
              value={assignedDrafts[iv.intervention_id] ?? (iv.assigned_to || '')}
              onChange={e => setAssignedDrafts(p => ({ ...p, [iv.intervention_id]: e.target.value }))}
            />
            <button
              className={`iv-save-btn${assignedSaved[iv.intervention_id] ? ' iv-save-btn--saved' : ''}`}
              onClick={async () => {
                const val = assignedDrafts[iv.intervention_id] !== undefined
                  ? assignedDrafts[iv.intervention_id]
                  : (iv.assigned_to || '')
                await updateCase(iv.intervention_id, { assigned_to: val || null })
                setAssignedSaved(p => ({ ...p, [iv.intervention_id]: true }))
                setTimeout(() => setAssignedSaved(p => ({ ...p, [iv.intervention_id]: false })), 2000)
              }}
            >
              {assignedSaved[iv.intervention_id] ? '✓ Saved' : 'Save'}
            </button>
          </div>
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
  )
}

// ─── Org Attendance Tab ───────────────────────────────────────────────────────

function OrgAttendanceTab({ orgId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState({ key: 'class_name', dir: 1 })
  const [expanded, setExpanded] = useState(null)
  const [classDetails, setClassDetails] = useState({})
  const [window_, setWindow] = useState('28d')

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    setClassDetails({})
    apiGet(`/orgs/${orgId}/attendance?window=${window_}`)
      .then(d => { setRows(d.classes); setLoading(false) })
      .catch(() => { setError('Failed to load attendance data.'); setLoading(false) })
  }, [orgId, window_])

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir * -1 } : { key, dir: 1 })
  }

  function toggleExpand(classId) {
    const opening = expanded !== classId
    setExpanded(opening ? classId : null)
    if (opening && !classDetails[classId]) {
      setClassDetails(d => ({ ...d, [classId]: { loading: true, students: [] } }))
      apiGet(`/attendance/class/${classId}/summary?window=${window_}`)
        .then(({ students }) => {
          setClassDetails(d => ({ ...d, [classId]: { loading: false, students } }))
        })
        .catch(() => setClassDetails(d => ({ ...d, [classId]: { loading: false, students: [], error: true } })))
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key] ?? ''
    const bv = b[sort.key] ?? ''
    return typeof av === 'number'
      ? (av - bv) * sort.dir
      : String(av).localeCompare(String(bv)) * sort.dir
  })

  function SortIcon({ col }) {
    if (sort.key !== col) return <span style={{ opacity: 0.3 }}>↕</span>
    return <span>{sort.dir === 1 ? '↑' : '↓'}</span>
  }

  function rateColor(rate) {
    if (rate >= 90) return '#4ade80'
    if (rate >= 75) return '#facc15'
    return '#f87171'
  }

  if (loading) return <div className="admin-empty" style={{ padding: '48px 0' }}>Loading attendance data...</div>
  if (error) return <div className="admin-empty" style={{ padding: '48px 0', color: '#f87171' }}>{error}</div>

  const totalRecords = rows.reduce((s, r) => s + r.total_records, 0)
  const orgRate = totalRecords > 0 ? Math.round(rows.reduce((s, r) => s + r.on_time, 0) / totalRecords * 100) : 0

  const COLS = [
    { key: 'class_name', label: 'Class' },
    { key: 'teacher_name', label: 'Teacher' },
    { key: 'total_records', label: 'Sessions' },
    { key: 'on_time', label: 'On time' },
    { key: 'late', label: 'Late' },
    { key: 'attendance_rate', label: 'On-time rate' },
  ]

  return (
    <div className="detail-section-card detail-section-card--full" style={{ marginTop: 24 }}>
      <div className="detail-section-header" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span className="detail-section-title">Attendance by class</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {rows.length} classes &middot; org average{' '}
          <span style={{ color: rateColor(orgRate), fontWeight: 600 }}>{orgRate}%</span>
        </span>
        <select className="admin-input" style={{
          marginLeft: 'auto', flex: '0 0 auto', width: 'auto',
          appearance: 'none', paddingRight: 28,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23ffffff' stroke-opacity='0.5' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
          value={window_} onChange={e => setWindow(e.target.value)}>
          <option value="28d">Last 28 days</option>
          <option value="school_year">This school year</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="admin-empty" style={{ padding: '20px' }}>No classes found for this organization.</div>
      ) : (
        <div style={{ padding: '16px 20px 20px', overflowX: 'auto' }}>
          <table className="attendance-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                {COLS.map(col => (
                  <th key={col.key} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onClick={() => toggleSort(col.key)}>
                    {col.label} <SortIcon col={col.key} />
                  </th>
                ))}
                <th style={{ width: 24 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const isOpen = expanded === row.class_id
                const detail = classDetails[row.class_id]
                return (
                  <>
                    <tr key={row.class_id} onClick={() => toggleExpand(row.class_id)}
                      style={{ cursor: 'pointer' }} className={`att-class-row${isOpen ? ' is-open' : ''}`}>
                      <td style={{ fontWeight: 500 }}>{row.class_name || '—'}</td>
                      <td style={{ color: 'rgba(255,255,255,0.6)' }}>{row.teacher_name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{row.total_records}</td>
                      <td style={{ textAlign: 'center', color: '#4ade80' }}>{row.on_time}</td>
                      <td style={{ textAlign: 'center', color: '#facc15' }}>{row.late}</td>
                      <td style={{ textAlign: 'center' }}>
                        {row.total_records > 0
                          ? <span style={{ color: rateColor(row.attendance_rate), fontWeight: 600 }}>{row.attendance_rate}%</span>
                          : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign: 'right', paddingLeft: 4 }}>
                        <span className="teacher-chevron" style={{ display: 'inline-block' }}>›</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${row.class_id}-detail`}>
                        <td colSpan={7} style={{ padding: '0 0 8px 12px', background: 'rgba(255,255,255,0.02)' }}>
                          {detail?.loading && (
                            <div style={{ padding: '10px 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading...</div>
                          )}
                          {detail?.error && (
                            <div style={{ padding: '10px 0', color: '#f87171', fontSize: 13 }}>Failed to load student data.</div>
                          )}
                          {detail && !detail.loading && !detail.error && (
                            detail.students.length === 0
                              ? <div style={{ padding: '10px 0', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No attendance records yet.</div>
                              : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                  <thead>
                                    <tr>
                                      {['Student', 'Sessions', 'On time', 'Late', 'On-time rate'].map(h => (
                                        <th key={h} style={{ textAlign: h === 'Student' ? 'left' : 'center', padding: '8px 12px', color: 'rgba(255,255,255,0.35)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.students.map(s => (
                                      <tr key={s.student_email}>
                                        <td style={{ padding: '8px 12px' }}>
                                          {s.student_user_id
                                            ? <button className="sp-student-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'rgba(255,255,255,0.75)', textAlign: 'left', fontSize: 'inherit' }} onClick={e => { e.stopPropagation(); navigate(`/admin/students/${s.student_user_id}`) }}>{s.student_email}</button>
                                            : <span style={{ color: 'rgba(255,255,255,0.75)' }}>{s.student_email}</span>
                                          }
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '8px 12px' }}>{s.sessions}</td>
                                        <td style={{ textAlign: 'center', padding: '8px 12px', color: '#4ade80' }}>{s.on_time}</td>
                                        <td style={{ textAlign: 'center', padding: '8px 12px', color: '#facc15' }}>{s.late}</td>
                                        <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                                          <span style={{ color: rateColor(s.attendance_rate), fontWeight: 600 }}>{s.attendance_rate}%</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Leak Signal (attendance-integrity brief §D) ──────────────────────────────

function LeakSignalTab({ orgId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [classSort, setClassSort] = useState({ key: 'leak_rate', dir: -1 })
  const [teacherSort, setTeacherSort] = useState({ key: 'leak_rate', dir: -1 })

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    apiGet(`/orgs/${orgId}/leak-signal`)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load leak signal data.'); setLoading(false) })
  }, [orgId])

  function sortRows(rows, sort) {
    return [...rows].sort((a, b) => {
      const av = a[sort.key] ?? 0, bv = b[sort.key] ?? 0
      return typeof av === 'number' ? (av - bv) * sort.dir : String(av).localeCompare(String(bv)) * sort.dir
    })
  }

  function toggleSort(setSort) {
    return key => setSort(s => s.key === key ? { key, dir: s.dir * -1 } : { key, dir: -1 })
  }

  function rateColor(rate, threshold) {
    if (rate >= threshold) return '#f87171'
    if (rate >= threshold * 0.5) return '#facc15'
    return '#4ade80'
  }

  if (loading) return <div className="admin-empty" style={{ padding: '48px 0' }}>Loading leak signal data...</div>
  if (error) return <div className="admin-empty" style={{ padding: '48px 0', color: '#f87171' }}>{error}</div>
  if (!data) return null

  const threshold = data.leak_threshold ?? 0.15
  const classCols = [
    { key: 'class_name', label: 'Class' },
    { key: 'teacher_name', label: 'Teacher' },
    { key: 'total_events', label: 'Sessions' },
    { key: 'override_rate', label: 'Override rate' },
    { key: 'leak_rate', label: 'Leak rate' },
  ]
  const teacherCols = [
    { key: 'teacher_name', label: 'Teacher' },
    { key: 'total_events', label: 'Sessions' },
    { key: 'override_rate', label: 'Override rate' },
    { key: 'leak_rate', label: 'Leak rate' },
  ]

  function Table({ rows, cols, sort, onSort }) {
    return (
      <table className="attendance-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            {cols.map(col => (
              <th key={col.key} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={() => onSort(col.key)}>
                {col.label} {sort.key === col.key ? (sort.dir === 1 ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortRows(rows, sort).map((row, i) => (
            <tr key={row.class_id || row.teacher_id || i}>
              {cols.map(col => {
                const val = row[col.key]
                if (col.key === 'leak_rate' || col.key === 'override_rate') {
                  const pct = Math.round((val ?? 0) * 100)
                  return (
                    <td key={col.key} style={{ textAlign: 'center' }}>
                      <span style={{ color: col.key === 'leak_rate' ? rateColor(val, threshold) : 'inherit', fontWeight: col.key === 'leak_rate' ? 600 : 400 }}>
                        {pct}%
                      </span>
                      {col.key === 'leak_rate' && row.flagged && <span title="Over threshold" style={{ marginLeft: 6 }}>⚠</span>}
                    </td>
                  )
                }
                if (col.key === 'total_events') return <td key={col.key} style={{ textAlign: 'center' }}>{val}</td>
                return <td key={col.key}>{val || '—'}</td>
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="admin-empty" style={{ padding: 16 }}>No data in the lookback window.</td></tr>
          )}
        </tbody>
      </table>
    )
  }

  return (
    <div className="detail-section-card detail-section-card--full" style={{ marginTop: 24 }}>
      <div className="detail-section-header" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span className="detail-section-title">Data quality</span>
        <span className="leak-signal-meta">
          Trailing {data.lookback_days} days &middot; flag threshold {Math.round(threshold * 100)}%
        </span>
      </div>
      <p className="leak-signal-desc">
        Leak rate is the share of attendance events that occur without LinkJoin, a signal that attendance is not being
        recorded accurately.
      </p>
      <div style={{ padding: '8px 20px 20px' }}>
        <div className="leak-signal-section-label" style={{ margin: '12px 0 8px' }}>By teacher</div>
        <div style={{ overflowX: 'auto' }}>
          <Table rows={data.by_teacher} cols={teacherCols} sort={teacherSort} onSort={toggleSort(setTeacherSort)} />
        </div>
        <div className="leak-signal-section-label" style={{ margin: '24px 0 8px' }}>By class</div>
        <div style={{ overflowX: 'auto' }}>
          <Table rows={data.by_class} cols={classCols} sort={classSort} onSort={toggleSort(setClassSort)} />
        </div>
      </div>
    </div>
  )
}

// ─── Org Intervention List ────────────────────────────────────────────────────

function OrgInterventionList({ onBack, initialExpanded = null }) {
  const { email: currentUserEmail, role } = useAuth()
  const [interventions, setInterventions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(role === 'teacher' ? 'mine' : 'active')
  const [search, setSearch] = useState('')
  const [expandedCase, setExpandedCase] = useState(initialExpanded)
  const [noteInputs, setNoteInputs] = useState({})
  const [assignedDrafts, setAssignedDrafts] = useState({})
  const [assignedSaved, setAssignedSaved] = useState({})
  const [studentProfiles, setStudentProfiles] = useState({})
  const [atRisk, setAtRisk] = useState([])
  const [atRiskLoading, setAtRiskLoading] = useState(true)
  const [creatingCases, setCreatingCases] = useState({})

  useEffect(() => {
    setLoading(true)
    const qs = filter === 'mine' ? '?mine=true'
      : filter === 'all' ? '?status=all'
      : filter === 'resolved' ? '?status=resolved'
      : ''
    apiGet(`/interventions${qs}`).then(ivs => setInterventions(Array.isArray(ivs) ? ivs : [])).finally(() => setLoading(false))
  }, [filter])

  useEffect(() => {
    setAtRiskLoading(true)
    apiGet('/interventions/at-risk')
      .then(data => setAtRisk(Array.isArray(data) ? data : []))
      .catch(() => setAtRisk([]))
      .finally(() => setAtRiskLoading(false))
  }, [])

  async function createCaseFromFlag(flag) {
    const key = `${flag.class_id}:${flag.student_email}:${flag.flag_type}`
    setCreatingCases(p => ({ ...p, [key]: true }))
    try {
      const iv = await apiPost('/interventions', {
        class_id: flag.class_id,
        student_email: flag.student_email,
        flag_type: flag.flag_type,
      })
      setAtRisk(prev => prev.filter(f => !(f.class_id === flag.class_id && f.student_email === flag.student_email && f.flag_type === flag.flag_type)))
      setInterventions(prev => [iv, ...prev])
      if (filter !== 'active' && filter !== 'mine') setFilter('active')
    } catch (e) { console.error(e) }
    setCreatingCases(p => ({ ...p, [key]: false }))
  }

  // Load full student profiles + attendance stats when a case card is expanded
  useEffect(() => {
    if (!expandedCase) return
    const iv = interventions.find(x => x.intervention_id === expandedCase)
    if (!iv) return
    const uid = iv.student_user_id
    if (!uid || studentProfiles[uid] !== undefined) return
    Promise.allSettled([
      apiGet(`/users/student/${uid}`),
      apiGet(`/attendance/class/${iv.class_id}/patterns?student_email=${encodeURIComponent(iv.student_email)}`),
    ]).then(([profileResult, patternsResult]) => {
      if (profileResult.status === 'rejected') {
        setStudentProfiles(p => ({ ...p, [uid]: null }))
        return
      }
      const profile = profileResult.value
      const patterns = patternsResult.status === 'fulfilled' ? patternsResult.value : null
      const studentRow = (patterns?.students || []).find(s => s.student_email === iv.student_email) || null
      setStudentProfiles(p => ({ ...p, [uid]: { ...profile, _attendanceRow: studentRow } }))
    })
  }, [expandedCase, interventions, studentProfiles])

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

  const detailProps = { updateCase, addNote, deleteNote, noteInputs, setNoteInputs, assignedDrafts, setAssignedDrafts, assignedSaved, setAssignedSaved }

  return (
    <div>
      {!atRiskLoading && atRisk.length > 0 && (
        <div className="iv-atrisk-section">
          <div className="iv-atrisk-header">
            <span className="iv-atrisk-title">Attention needed ({atRisk.length})</span>
            <span className="iv-atrisk-sub">Students with attendance flags but no open intervention case</span>
          </div>
          <div className="iv-atrisk-list">
            {atRisk.map(flag => {
              const key = `${flag.class_id}:${flag.student_email}:${flag.flag_type}`
              const busy = !!creatingCases[key]
              return (
                <div key={key} className="iv-atrisk-row">
                  <div className="iv-atrisk-left">
                    <span className="iv-student-name">{flag.student_email}</span>
                    <span className="iv-class-chip">{flag.class_name}</span>
                    <span className={`att-badge ${flag.flag_type === 'repeat_tardy' ? 'att-late' : 'att-slightly-late'}`}>
                      {flag.flag_type === 'repeat_tardy'
                        ? `Repeat tardy (${Math.round(flag.rate * 100)}% of sessions)`
                        : `Low attendance (${Math.round(flag.rate * 100)}% present)`}
                    </span>
                  </div>
                  <button
                    className="iv-atrisk-create-btn"
                    disabled={busy}
                    onClick={() => createCaseFromFlag(flag)}
                  >
                    {busy ? 'Opening...' : 'Open case'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="iv-toolbar">
        <input
          className="iv-search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, category, or class…"
        />
        <div className="iv-filter-row">
          {['mine', 'active', 'resolved', 'all'].map(f => (
            <button key={f} className={`iv-filter-btn${filter === f ? ' iv-filter-btn--active' : ''}`}
              onClick={() => { setFilter(f); setExpandedCase(null) }}>
              {f === 'active' ? 'Open / In progress' : f === 'mine' ? 'My interventions' : f === 'resolved' ? 'Resolved' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="admin-spinner-wrap admin-spinner-wrap--inline"><div className="admin-spinner" /></div>}
      {!loading && visible.length === 0 && (
        <div className="admin-empty" style={{ marginTop: 24 }}>
          {q ? 'No matches.' : filter === 'mine' ? 'No cases are assigned to you.' : 'No interventions found.'}
        </div>
      )}

      {filter === 'mine' ? (
        <div className="iv-mine-list" style={{ marginTop: 12 }}>
          {visible.map(iv => {
            const expanded = expandedCase === iv.intervention_id
            return (
              <div key={iv.intervention_id} className="iv-mine-card">
                <button
                  className={`iv-mine-header${expanded ? ' iv-mine-header--open' : ''}`}
                  onClick={() => setExpandedCase(expanded ? null : iv.intervention_id)}
                >
                  <div className="iv-mine-header-left">
                    <span className="iv-student-name">{iv.student_name || iv.student_email}</span>
                    <span className="iv-student-email">{iv.student_name ? iv.student_email : ''}{iv.student_name && iv.class_name ? ' · ' : ''}{iv.class_name}</span>
                  </div>
                  <div className="iv-mine-header-right">
                    <span className={`att-badge ${iv.flag_type === 'repeat_tardy' ? 'att-late' : 'att-slightly-late'}`}>
                      {iv.flag_type === 'repeat_tardy' ? 'Repeat tardy' : 'Low attendance'}
                    </span>
                    <span className={`iv-status-pill iv-status-pill--${iv.status}`}>
                      {iv.status === 'open' ? 'Open' : 'In progress'}
                    </span>
                    <span className="iv-chevron">{expanded ? '▾' : '▸'}</span>
                  </div>
                </button>
                {expanded && <IvDetailPanel iv={iv} {...detailProps} studentProfile={studentProfiles[iv.student_user_id]} />}
              </div>
            )
          })}
        </div>
      ) : (
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
                <IvDetailPanel iv={iv} {...detailProps} parentContact={null} studentProfile={studentProfiles[iv.student_user_id]} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── School Admin View ────────────────────────────────────────────────────────

const PAGE_SIZE = 20

function SchoolAdminView() {
  const navigate = useNavigate()
  const { orgId } = useAuth()
  const classMatch = useMatch('/admin/class/:classId')
  const studentMatch = useMatch('/admin/students/:userId')
  const parentMatch = useMatch('/admin/parents/:parentId')
  const urlClassId = classMatch?.params?.classId ?? null
  const urlUserId = studentMatch?.params?.userId ?? null
  const urlParentId = parentMatch?.params?.parentId ?? null

  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [openCases, setOpenCases] = useState([])
  const [activeTab, setActiveTab] = useState('teachers')
  const [brandName, setBrandName] = useState('')
  const [brandSaved, setBrandSaved] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgNameSaved, setOrgNameSaved] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showInviteTeacher, setShowInviteTeacher] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState(null)
  const [pendingInvites, setPendingInvites] = useState([])
  const [orgTeachers, setOrgTeachers] = useState([])
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [csvRows, setCsvRows] = useState([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResults, setCsvResults] = useState(null)
  const csvFileRef = useRef(null)
  const [showParentCsvImport, setShowParentCsvImport] = useState(false)
  const [parentCsvRows, setParentCsvRows] = useState([])
  const [parentCsvImporting, setParentCsvImporting] = useState(false)
  const [parentCsvResults, setParentCsvResults] = useState(null)
  const parentCsvFileRef = useRef(null)

  useEffect(() => {
    apiGet('/classes').then(cls => setClasses(cls)).finally(() => setLoading(false))
    apiGet('/interventions').then(ivs => setOpenCases(Array.isArray(ivs) ? ivs : [])).catch(() => {})
    if (orgId) {
      apiGet(`/orgs/${orgId}`).then(org => { setBrandName(org.brand_name || ''); setOrgName(org.name || '') }).catch(() => {})
      apiGet(`/orgs/${orgId}/members`).then(members => {
        setOrgTeachers(Array.isArray(members) ? members.filter(m => m.role === 'teacher') : [])
      }).catch(() => {})
    }
    apiGet('/invites').then(ivs => setPendingInvites(Array.isArray(ivs) ? ivs.filter(i => i.type === 'teacher' && i.status === 'pending') : [])).catch(() => {})
  }, [orgId])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSearchNavigate = useCallback((item) => {
    if (item.tab) setActiveTab(item.tab)
    if (item.classId) {
      navigate(`/admin/class/${item.classId}`)
      return
    }
    if (item.scroll) {
      const tryScroll = (attemptsLeft) => {
        const el = document.getElementById(item.scroll)
        if (el && el.getBoundingClientRect().height > 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else if (attemptsLeft > 0) {
          setTimeout(() => tryScroll(attemptsLeft - 1), 100)
        }
      }
      setTimeout(() => tryScroll(15), 80)
    }
  }, [classes])

  const dynamicSearchIndex = classes.flatMap(cls => [
    {
      label: cls.name || 'Untitled class',
      hint: `${cls.teacher_name || cls.teacher_email || 'Unknown teacher'} · ${(cls.student_ids || []).length} students`,
      tab: 'teachers',
      classId: cls.class_id,
      scroll: null,
      keywords: [cls.teacher_email || '', cls.teacher_name || ''],
    },
  ])

  async function saveOrgName() {
    if (!orgName.trim()) return
    try {
      await apiPatch(`/orgs/${orgId}`, { name: orgName.trim() })
      setOrgNameSaved(true)
      setTimeout(() => setOrgNameSaved(false), 2000)
    } catch { /* ignore */ }
  }

  async function saveBrandName() {
    try {
      await apiPatch(`/orgs/${orgId}`, { brand_name: brandName })
      setBrandSaved(true)
      setTimeout(() => setBrandSaved(false), 2000)
    } catch { /* ignore */ }
  }

  async function sendTeacherInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true); setInviteResult(null)
    try {
      const inv = await apiPost('/invites', { type: 'teacher', email: inviteEmail.trim().toLowerCase() })
      setInviteResult({ ok: true, msg: `Invite sent to ${inviteEmail.trim()}` })
      setPendingInvites(prev => [...prev, inv])
      setInviteEmail('')
      setTimeout(() => { setInviteResult(null); setShowInviteTeacher(false) }, 2500)
    } catch (e) {
      setInviteResult({ ok: false, msg: e?.message || 'Failed to send invite' })
    }
    setInviting(false)
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return []
    const header = lines[0].split(',').map(h => h.trim().toLowerCase())
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim())
      const row = {}
      header.forEach((h, i) => { row[h] = cols[i] || '' })
      return row
    }).filter(r => r.email)
  }

  function parseParentCsv(text) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return []
    const header = lines[0].split(',').map(h => h.trim().toLowerCase())
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim())
      const row = {}
      header.forEach((h, i) => { row[h] = cols[i] || '' })
      return row
    }).filter(r => r.parent_email)
  }

  function handleCsvFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setCsvRows(parseCsv(ev.target.result))
      setCsvResults(null)
    }
    reader.readAsText(file)
  }

  async function runCsvImport() {
    if (!csvRows.length || !orgId) return
    setCsvImporting(true); setCsvResults(null)
    try {
      const res = await apiPost(`/orgs/${orgId}/import-staff`, { rows: csvRows })
      setCsvResults(res.results || [])
      const newMembers = await apiGet(`/orgs/${orgId}/members`)
      setOrgTeachers(Array.isArray(newMembers) ? newMembers.filter(m => m.role === 'teacher') : [])
    } catch (e) {
      setCsvResults([{ email: '', status: 'error', error: e?.message || 'Import failed' }])
    }
    setCsvImporting(false)
  }

  function handleParentCsvFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setParentCsvRows(parseParentCsv(ev.target.result))
      setParentCsvResults(null)
    }
    reader.readAsText(file)
  }

  async function runParentCsvImport() {
    if (!parentCsvRows.length || !orgId) return
    setParentCsvImporting(true); setParentCsvResults(null)
    try {
      const res = await apiPost(`/orgs/${orgId}/import-parents`, { rows: parentCsvRows })
      setParentCsvResults(res.results || [])
    } catch (e) {
      setParentCsvResults([{ parent_email: '', student_email: '', status: 'error', error: e?.message || 'Import failed' }])
    }
    setParentCsvImporting(false)
  }

  async function rescindInvite(token) {
    try {
      await apiDelete(`/invites/${token}`)
      setPendingInvites(prev => prev.filter(iv => iv.token !== token))
    } catch (e) {
      // silently ignore -- invite may have already been used
    }
  }

  const teacherLabels = {}
  classes.forEach(cls => {
    teacherLabels[cls.teacher_id] = {
      name: cls.teacher_name || '',
      email: cls.teacher_email || '',
      avatar: cls.teacher_avatar || '',
    }
  })
  const byTeacher = classes.reduce((acc, cls) => {
    const tid = cls.teacher_id
    if (!acc[tid]) acc[tid] = []
    acc[tid].push(cls)
    return acc
  }, {})
  // Include teachers who have no classes yet
  orgTeachers.forEach(t => {
    if (!byTeacher[t.user_id]) {
      byTeacher[t.user_id] = []
      teacherLabels[t.user_id] = { name: t.name || '', email: t.username || '', avatar: '' }
    }
  })

  if (urlParentId) {
    return (
      <ParentProfile
        userId={urlParentId}
        onBack={() => navigate(-1)}
        onOpenStudent={id => navigate(`/admin/students/${id}`)}
      />
    )
  }

  if (urlUserId) {
    return (
      <StudentProfile
        userId={urlUserId}
        onBack={() => navigate(-1)}
        onOpenClass={classId => navigate(`/admin/class/${classId}`)}
        onOpenIntervention={(classId, ivId) => navigate(`/admin/class/${classId}`, { state: { tab: 'interventions', expandedCase: ivId } })}
        onOpenParent={parentId => navigate(`/admin/parents/${parentId}`)}
      />
    )
  }

  if (loading) return <div className="admin-spinner-wrap"><div className="admin-spinner" /></div>

  const selected = urlClassId ? classes.find(c => c.class_id === urlClassId) ?? null : null

  if (selected) {
    return (
      <ClassDetail
        cls={selected}
        onBack={() => navigate(-1)}
        onUpdate={fresh => setClasses(prev => prev.map(c =>
          c.class_id === fresh.class_id
            ? { ...fresh, teacher_email: c.teacher_email, teacher_name: c.teacher_name }
            : c
        ))}
        onViewStudent={id => navigate(`/admin/students/${id}`)}
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
      {searchOpen && (
        <AdminSearch
          extraIndex={dynamicSearchIndex}
          onClose={() => setSearchOpen(false)}
          onNavigate={handleSearchNavigate}
        />
      )}
      <div className="admin-tabs">
        <button className={`admin-tab${activeTab === 'teachers' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('teachers')}>Teachers</button>
        <button className={`admin-tab${activeTab === 'interventions' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('interventions')}>
          Interventions
          {openCases.length > 0 && <span className="admin-tab-badge">{openCases.length}</span>}
        </button>
        <button className={`admin-tab${activeTab === 'attendance' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('attendance')}>Attendance</button>
        <button className={`admin-tab${activeTab === 'leak-signal' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('leak-signal')}>Data Quality</button>
        <button className={`admin-tab${activeTab === 'log' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('log')}>Meeting Log</button>
        <button className={`admin-tab${activeTab === 'org' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('org')}>Organization</button>
        <button className={`admin-tab${activeTab === 'integrations' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('integrations')}>Integrations</button>
        <button className="admin-tab admin-search-trigger" onClick={() => setSearchOpen(true)} title="Search (⌘K)">
          <span className="admin-search-trigger-icon">⌕</span>
          <span className="admin-search-trigger-label">Search</span>
          <kbd className="admin-search-trigger-kbd">⌘K</kbd>
        </button>
      </div>

      {activeTab === 'attendance' && <OrgAttendanceTab orgId={orgId} />}
      {activeTab === 'leak-signal' && <LeakSignalTab orgId={orgId} />}
      {activeTab === 'interventions' && <OrgInterventionList onBack={() => setActiveTab('teachers')} />}
      {activeTab === 'log' && <HistoryPanel />}
      {activeTab === 'org' && <OrgSettingsTab orgId={orgId} orgName={orgName} setOrgName={setOrgName} orgNameSaved={orgNameSaved} saveOrgName={saveOrgName} brandName={brandName} setBrandName={setBrandName} brandSaved={brandSaved} saveBrandName={saveBrandName} />}
      {activeTab === 'integrations' && <OrgIntegrationsTab orgId={orgId} />}
      {activeTab === 'teachers' && <>

      <div className="ti-import-section">
        <div className="ti-import-label">Add staff</div>
        <div className="ti-import-cards">

          <button className="ti-import-card" onClick={() => { setShowInviteTeacher(true); setInviteResult(null) }}>
            <svg className="ti-import-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>
            <div className="ti-import-card-title">Email invite</div>
            <div className="ti-import-card-desc">Send a signup link to one or more teachers</div>
          </button>

          <button className="ti-import-card" onClick={() => { setShowCsvImport(true); setCsvRows([]); setCsvResults(null) }}>
            <svg className="ti-import-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
            <div className="ti-import-card-title">Import CSV</div>
            <div className="ti-import-card-desc">Upload a spreadsheet of staff emails and roles</div>
          </button>

          <button className="ti-import-card" onClick={() => setActiveTab('integrations')}>
            <img src="/images/lms/clever.svg" alt="Clever" className="ti-import-icon ti-import-icon--img" />
            <div className="ti-import-card-title">Clever</div>
            <div className="ti-import-card-desc">Sync your roster automatically via Clever</div>
          </button>

        </div>
      </div>

      <div className="ti-import-section">
        <div className="ti-import-label">Add parents</div>
        <div className="ti-import-cards">
          <button className="ti-import-card" onClick={() => { setShowParentCsvImport(true); setParentCsvRows([]); setParentCsvResults(null) }}>
            <svg className="ti-import-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
            <div className="ti-import-card-title">Import CSV</div>
            <div className="ti-import-card-desc">Upload a spreadsheet linking parent and student emails</div>
          </button>
        </div>
      </div>

      {showInviteTeacher && (
        <div className="iv-modal-backdrop" onClick={() => setShowInviteTeacher(false)}>
          <div className="iv-modal" onClick={e => e.stopPropagation()}>
            <div className="iv-modal-title">Invite teacher</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px' }}>
              Send an invite email. The recipient will be able to sign up as a teacher in your organization.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="admin-input"
                style={{ flex: 1 }}
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendTeacherInvite()}
                placeholder="teacher@school.edu"
                autoFocus
              />
              <button className="admin-btn" onClick={sendTeacherInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? '...' : 'Send'}
              </button>
            </div>
            {inviteResult && (
              <div style={{ marginTop: 10, fontSize: 13, color: inviteResult.ok ? '#4ade80' : '#f87171' }}>
                {inviteResult.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {showCsvImport && (
        <div className="iv-modal-backdrop" onClick={() => setShowCsvImport(false)}>
          <div className="iv-modal iv-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="iv-modal-title">Import staff from CSV</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>
              CSV must have an <code>email</code> column. Optional: <code>role</code> (teacher / school_admin), <code>first_name</code>, <code>last_name</code>.
            </p>
            <a
              href="data:text/csv;charset=utf-8,email%2Crole%2Cfirst_name%2Clast_name%0Ateacher%40school.edu%2Cteacher%2CJane%2CDoe"
              download="staff-import-template.csv"
              style={{ fontSize: 12, color: 'var(--lightblue)', marginBottom: 14, display: 'inline-block' }}
            >
              Download template
            </a>
            <input ref={csvFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCsvFile} />
            {!csvRows.length ? (
              <button className="ti-csv-drop" onClick={() => csvFileRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/></svg>
                <span>Choose CSV file</span>
              </button>
            ) : (
              <>
                <div className="ti-csv-preview">
                  <div className="ti-csv-count">{csvRows.length} row{csvRows.length !== 1 ? 's' : ''} found</div>
                  <div className="ti-csv-table">
                    <div className="ti-csv-header">
                      <span>Email</span><span>Role</span><span>Name</span>
                    </div>
                    {csvRows.slice(0, 8).map((r, i) => (
                      <div key={i} className={`ti-csv-row${csvResults ? (' ti-csv-row--' + (csvResults[i]?.status || '')) : ''}`}>
                        <span>{r.email}</span>
                        <span>{r.role || 'teacher'}</span>
                        <span>{[r.first_name, r.last_name].filter(Boolean).join(' ') || <span style={{opacity:0.3}}>—</span>}</span>
                        {csvResults?.[i] && (
                          <span className={`ti-csv-status ti-csv-status--${csvResults[i].status}`}>
                            {csvResults[i].status === 'created' ? 'Created' : csvResults[i].status === 'updated' ? 'Updated' : csvResults[i].error || 'Error'}
                          </span>
                        )}
                      </div>
                    ))}
                    {csvRows.length > 8 && <div className="ti-csv-more">+{csvRows.length - 8} more</div>}
                  </div>
                </div>
                {!csvResults && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="admin-btn-ghost" onClick={() => { setCsvRows([]); csvFileRef.current.value = '' }}>Choose different file</button>
                    <button className="admin-btn" onClick={runCsvImport} disabled={csvImporting}>{csvImporting ? 'Importing...' : `Import ${csvRows.length} staff`}</button>
                  </div>
                )}
                {csvResults && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#4ade80' }}>
                    Done — {csvResults.filter(r => r.status === 'created').length} created, {csvResults.filter(r => r.status === 'updated').length} updated
                    {csvResults.filter(r => r.status === 'error').length > 0 && <span style={{ color: '#f87171' }}>, {csvResults.filter(r => r.status === 'error').length} errors</span>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showParentCsvImport && (
        <div className="iv-modal-backdrop" onClick={() => setShowParentCsvImport(false)}>
          <div className="iv-modal iv-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="iv-modal-title">Import parents from CSV</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>
              CSV must have <code>parent_email</code> and <code>student_email</code> columns. New parent accounts are created automatically.
            </p>
            <a
              href="data:text/csv;charset=utf-8,parent_email%2Cstudent_email%0Aparent%40example.com%2Cstudent%40school.edu"
              download="parent-import-template.csv"
              style={{ fontSize: 12, color: 'var(--lightblue)', marginBottom: 14, display: 'inline-block' }}
            >
              Download template
            </a>
            <input ref={parentCsvFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleParentCsvFile} />
            {!parentCsvRows.length ? (
              <button className="ti-csv-drop" onClick={() => parentCsvFileRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/></svg>
                <span>Choose CSV file</span>
              </button>
            ) : (
              <>
                <div className="ti-csv-preview">
                  <div className="ti-csv-count">{parentCsvRows.length} row{parentCsvRows.length !== 1 ? 's' : ''} found</div>
                  <div className="ti-csv-table">
                    <div className="ti-csv-header">
                      <span>Parent email</span><span>Student email</span><span>Status</span>
                    </div>
                    {parentCsvRows.slice(0, 8).map((r, i) => (
                      <div key={i} className={`ti-csv-row${parentCsvResults ? (' ti-csv-row--' + (parentCsvResults[i]?.status || '')) : ''}`}>
                        <span>{r.parent_email}</span>
                        <span>{r.student_email}</span>
                        <span>
                          {parentCsvResults?.[i] && (
                            <span className={`ti-csv-status ti-csv-status--${parentCsvResults[i].status}`}>
                              {parentCsvResults[i].status === 'created' ? 'Created' : parentCsvResults[i].status === 'updated' ? 'Updated' : parentCsvResults[i].error || 'Error'}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                    {parentCsvRows.length > 8 && <div className="ti-csv-more">+{parentCsvRows.length - 8} more</div>}
                  </div>
                </div>
                {!parentCsvResults && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="admin-btn-ghost" onClick={() => { setParentCsvRows([]); parentCsvFileRef.current.value = '' }}>Choose different file</button>
                    <button className="admin-btn" onClick={runParentCsvImport} disabled={parentCsvImporting}>{parentCsvImporting ? 'Importing...' : `Import ${parentCsvRows.length} parents`}</button>
                  </div>
                )}
                {parentCsvResults && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#4ade80' }}>
                    Done — {parentCsvResults.filter(r => r.status === 'created').length} created, {parentCsvResults.filter(r => r.status === 'updated').length} updated
                    {parentCsvResults.filter(r => r.status === 'error').length > 0 && <span style={{ color: '#f87171' }}>, {parentCsvResults.filter(r => r.status === 'error').length} errors</span>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="ti-search-row">
        <div className="ti-search-wrap">
          <svg className="ti-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            className="ti-search-input"
            value={search}
            onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE) }}
            placeholder="Search teachers…"
          />
          {search && <button className="ti-search-clear" onClick={() => setSearch('')} aria-label="Clear">×</button>}
        </div>
      </div>

      {pendingInvites.length > 0 && (
        <div className="teacher-pending-invites">
          <div className="teacher-pending-label">Pending invites</div>
          {pendingInvites.map((iv, i) => (
            <div key={iv.token || i} className="teacher-pending-row">
              <span className="teacher-pending-email">{iv.email}</span>
              <span className="iv-status-pill iv-status-pill--open">Pending</span>
              {iv.token && (
                <button className="teacher-pending-rescind" onClick={() => rescindInvite(iv.token)}>
                  Rescind
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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
                <div className="teacher-avatar" style={info.avatar ? {} : { background: av.bg, border: `1px solid ${av.border}` }}>
                  {info.avatar
                    ? <img src={info.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : (info.name?.trim()?.[0] || avatarSeed[0]).toUpperCase()}
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
                      <div key={cls.class_id} className="class-card class-card--nested" onClick={() => navigate(`/admin/class/${cls.class_id}`)}>
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
      <SideNav page="admin" />
      <div className="sn-content">
        <div className="admin-page">
          {role === 'teacher' && <TeacherView />}
          {role === 'school_admin' && <SchoolAdminView />}
          {role === 'district_admin' && <DistrictAdminView />}
        </div>
      </div>
    </div>
  )
}
