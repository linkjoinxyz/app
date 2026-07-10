import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api/client.js'
import HeaderModern from '../components/HeaderModern.jsx'
import '../styles/parent-portal.css'

const FLAG_LABELS = {
  low_attendance: 'Low attendance',
  repeat_tardy: 'Repeat tardy',
}

function AttendanceBadge({ rate, flag }) {
  if (flag) {
    return <span className={`pp-badge pp-badge--warn`}>{FLAG_LABELS[flag] || flag}</span>
  }
  if (rate === null || rate === undefined) return <span className="pp-badge pp-badge--neutral">No data</span>
  const pct = Math.round(rate * 100)
  if (pct >= 90) return <span className="pp-badge pp-badge--good">{pct}% present</span>
  if (pct >= 70) return <span className="pp-badge pp-badge--ok">{pct}% present</span>
  return <span className="pp-badge pp-badge--warn">{pct}% present</span>
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
        return (
          <div key={cls.class_id} className="pp-class-card">
            <button
              className="pp-class-header"
              onClick={() => setExpanded(isExpanded ? null : cls.class_id)}
            >
              <div className="pp-class-header-left">
                <span className="pp-class-name">{cls.class_name}</span>
                {cls.days && cls.days.length > 0 && (
                  <span className="pp-class-days">{cls.days.join(', ')}</span>
                )}
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

function AttendanceTab({ student }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiGet(`/parent/children/${student.user_id}/attendance`)
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [student.user_id])

  if (loading) return <div className="pp-loading">Loading attendance history...</div>
  if (!records.length) return <div className="pp-empty">No attendance records found.</div>

  return (
    <div className="pp-attendance">
      <table className="pp-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Class</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => {
            const dt = new Date(r.opened_at)
            const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            const late = (r.minutes_late || 0) > 5
            return (
              <tr key={i}>
                <td className="pp-dim">{dateStr}</td>
                <td>{r.class_name || r.class_id}</td>
                <td>
                  {late
                    ? <span className="pp-badge pp-badge--ok">{r.minutes_late}m late</span>
                    : <span className="pp-badge pp-badge--good">On time</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ParentPortal() {
  const { role, token } = useAuth()
  const navigate = useNavigate()
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedChild, setSelectedChild] = useState(null)
  const [tab, setTab] = useState('classes')

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
    <div className="pp-root">
      <HeaderModern page="parent" />
      <div className="pp-page">
        <div className="pp-header">
          <div className="pp-header-title">Parent Portal</div>
          <div className="pp-header-sub">View your children's classes and attendance</div>
        </div>

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
                  <button className={`admin-tab${tab === 'attendance' ? ' admin-tab--active' : ''}`} onClick={() => setTab('attendance')}>Attendance history</button>
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
