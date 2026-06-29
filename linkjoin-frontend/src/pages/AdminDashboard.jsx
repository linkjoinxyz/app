import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client.js'
import HeaderModern from '../components/HeaderModern.jsx'
import '../styles/admin.css'

// ─── helpers ────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

// ─── New Class Modal ─────────────────────────────────────────────────────────

function NewClassModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [time, setTime] = useState('')
  const [days, setDays] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function toggleDay(d) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function handleCreate() {
    if (!name.trim()) { setErr('Name is required'); return }
    setSaving(true)
    setErr('')
    try {
      const cls = await apiPost('/classes', { name: name.trim(), time: time.trim(), days })
      onCreated(cls)
    } catch (e) {
      setErr(e.body?.detail || 'Failed to create class')
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <h3>New Class</h3>

        <div className="admin-modal-field">
          <label className="admin-modal-label">Class Name</label>
          <input className="admin-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Period 3 — Algebra" autoFocus />
        </div>

        <div className="admin-modal-field">
          <label className="admin-modal-label">Time</label>
          <input className="admin-input" value={time} onChange={e => setTime(e.target.value)}
            placeholder="e.g. 9:00 AM" />
        </div>

        <div className="admin-modal-field">
          <label className="admin-modal-label">Days</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS_SHORT.map(d => (
              <button key={d} onClick={() => toggleDay(d)} style={{
                background: days.includes(d) ? 'rgba(43,143,216,0.35)' : 'rgba(255,255,255,0.06)',
                border: days.includes(d) ? '1px solid rgba(43,143,216,0.6)' : '1px solid rgba(255,255,255,0.12)',
                borderRadius: 5, padding: '5px 10px', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>{d}</button>
            ))}
          </div>
        </div>

        {err && <div className="admin-error">{err}</div>}

        <div className="admin-modal-actions">
          <button className="admin-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="admin-btn" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Class Detail (teacher view) ─────────────────────────────────────────────

function ClassDetail({ cls, onBack, teacherLinks, onUpdate }) {
  const [students, setStudents] = useState([])
  const [classLinks, setClassLinks] = useState([])
  const [addInput, setAddInput] = useState('')
  const [addErr, setAddErr] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  useEffect(() => {
    apiGet(`/classes/${cls.class_id}`).then(fresh => {
      setStudents(fresh.students || [])
      onUpdate(fresh)
    }).catch(() => {})
  }, [cls.class_id])

  useEffect(() => {
    const ids = cls.link_ids || []
    setClassLinks(teacherLinks.filter(l => ids.includes(l.id)))
  }, [cls.link_ids, teacherLinks])

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

  async function handleAddLink(linkId) {
    try {
      await apiPost(`/classes/${cls.class_id}/links/${linkId}`)
      const fresh = await apiGet(`/classes/${cls.class_id}`)
      setClassLinks(teacherLinks.filter(l => (fresh.link_ids || []).includes(l.id)))
      onUpdate(fresh)
    } catch (e) {
      console.error(e)
    }
    setShowLinkPicker(false)
  }

  async function handleRemoveLink(linkId) {
    try {
      await apiDelete(`/classes/${cls.class_id}/links/${linkId}`)
      setClassLinks(prev => prev.filter(l => l.id !== linkId))
    } catch (e) {
      console.error(e)
    }
  }

  const availableLinks = teacherLinks.filter(l => !(cls.link_ids || []).includes(l.id))

  return (
    <div className="detail-root">
      {/* Hero header — mirrors link card layout */}
      <div className="detail-hero">
        <button className="detail-back-btn" onClick={onBack}>
          <img src="/images/arrow-left.svg" alt="back" style={{ width: 18, height: 18, display: 'block' }} />
        </button>
        {cls.time && <div className="detail-time-pill">{cls.time}</div>}
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
            {availableLinks.length > 0 && (
              <button className="detail-section-add-btn"
                onClick={() => setShowLinkPicker(p => !p)}>
                {showLinkPicker ? 'Cancel' : '+ Add'}
              </button>
            )}
          </div>
          <div className="detail-section-body">
            {showLinkPicker && (
              <div className="detail-link-picker">
                {availableLinks.map(l => (
                  <button key={l.id} className="detail-link-picker-row" onClick={() => handleAddLink(l.id)}>
                    {l.name}
                  </button>
                ))}
              </div>
            )}
            {classLinks.length > 0 ? (
              <div className="class-links-list">
                {classLinks.map(l => (
                  <div key={l.id} className="class-link-pill">
                    <span>{l.name}</span>
                    <button onClick={() => handleRemoveLink(l.id)}>&#x2715;</button>
                  </div>
                ))}
              </div>
            ) : (
              !showLinkPicker && <div className="admin-empty">No links assigned yet.</div>
            )}
          </div>
        </div>

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

      </div>
    </div>
  )
}

// ─── Teacher View ─────────────────────────────────────────────────────────────

function TeacherView() {
  const [classes, setClasses] = useState([])
  const [myLinks, setMyLinks] = useState([])
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([apiGet('/classes'), apiGet('/links')])
      .then(([cls, links]) => {
        setClasses(cls)
        setMyLinks(links.links || [])
      })
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(cls) {
    setClasses(prev => [...prev, { ...cls, student_ids: [], link_ids: [] }])
    setShowNew(false)
  }

  function handleUpdate(fresh) {
    setClasses(prev => prev.map(c => c.class_id === fresh.class_id ? fresh : c))
    if (selected?.class_id === fresh.class_id) setSelected(fresh)
  }

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 40 }}>Loading...</div>

  if (selected) {
    return (
      <ClassDetail
        cls={selected}
        teacherLinks={myLinks}
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
                {cls.time && <span className="class-card-time">{cls.time}</span>}
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
        <button className="new-class-btn" onClick={() => setShowNew(true)}>+ New Class</button>
      </div>
      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </>
  )
}

// ─── School Admin View ────────────────────────────────────────────────────────

function SchoolAdminView() {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')

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
        teacherLinks={[]}
        onBack={() => setSelected(null)}
        onUpdate={fresh => setClasses(prev => prev.map(c => c.class_id === fresh.class_id ? fresh : c))}
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

  return (
    <>
      <div className="admin-search-row">
        <input
          className="admin-input admin-search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teachers…"
        />
      </div>
      <div className="teacher-list">
        {filteredTeachers.map(([tid, teacherClasses]) => {
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
                            {cls.time && <span className="class-card-time">{cls.time}</span>}
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
