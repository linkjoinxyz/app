import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPatch } from '../api/client.js'
import HeaderModern from '../components/HeaderModern.jsx'
import '../styles/platform-admin.css'

// ─── Orgs Tab ─────────────────────────────────────────────────────────────────

function OrgsTab() {
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/admin/orgs')
      .then(data => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="pa-section">
      <div className="pa-section-header">
        <span className="pa-section-title">Organizations</span>
        <button className="pa-btn pa-btn--icon" aria-label="Create organization" title="Create organization" onClick={() => navigate('/platform/orgs/new')}>+</button>
      </div>

      {loading ? (
        <div className="pa-empty">Loading...</div>
      ) : orgs.length === 0 ? (
        <div className="pa-empty">No organizations yet. Create one to get started.</div>
      ) : (
        <table className="pa-table pa-table--clickable">
          <thead><tr><th>Name</th><th>Type</th><th>Org ID</th></tr></thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.org_id} onClick={() => navigate(`/platform/orgs/${o.org_id}`)}>
                <td>{o.name}</td>
                <td><span className="pa-type-badge">{o.type}</span></td>
                <td className="pa-mono">{o.org_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [patching, setPatching] = useState({})
  const [err, setErr] = useState('')
  const [confirmAdmin, setConfirmAdmin] = useState(null)

  useEffect(() => {
    apiGet('/admin/users/search?q=')
      .then(data => setResults(Array.isArray(data) ? data : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [])

  async function search(e) {
    e.preventDefault()
    setLoading(true); setErr(''); setResults(null)
    try {
      const data = await apiGet(`/admin/users/search?q=${encodeURIComponent(q.trim())}`)
      setResults(Array.isArray(data) ? data : [data])
    } catch (e) {
      setErr(e?.detail || 'Search failed')
    }
    setLoading(false)
  }

  async function doTogglePlatformAdmin() {
    const u = confirmAdmin
    setConfirmAdmin(null)
    const next = u.admin !== 'true'
    setPatching(p => ({ ...p, [u.user_id]: true }))
    try {
      await apiPatch(`/admin/users/${u.user_id}/platform-admin`, { enabled: next })
      setResults(prev => prev.map(x => x.user_id === u.user_id ? { ...x, admin: next ? 'true' : 'false' } : x))
    } catch (e) {
      setErr(e?.detail || 'Update failed')
    }
    setPatching(p => ({ ...p, [u.user_id]: false }))
  }

  return (
    <div className="pa-section">
      <div className="pa-section-header">
        <span className="pa-section-title">Users</span>
        {results && <span className="pa-dim" style={{ fontSize: 13 }}>{results.length}{!q.trim() && ' most recent'}</span>}
      </div>
      <form className="pa-search-row" onSubmit={search}>
        <input className="pa-input pa-search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by email..." aria-label="Search users by email" />
        <button className="pa-btn" type="submit" disabled={loading}>{loading ? '...' : 'Search'}</button>
      </form>
      {err && <div className="pa-error">{err}</div>}
      {loading ? (
        <div className="pa-empty">Loading...</div>
      ) : results && (results.length === 0 ? (
        <div className="pa-empty">No users found.</div>
      ) : (
        <table className="pa-table">
          <thead><tr><th>Email</th><th>Role</th><th>Org ID</th><th>Confirmed</th><th>Platform admin</th></tr></thead>
          <tbody>
            {results.map(u => (
              <tr key={u.user_id}>
                <td>{u.username}</td>
                <td>{u.role || <span className="pa-dim">personal</span>}</td>
                <td className="pa-mono pa-dim">{u.org_id || '-'}</td>
                <td>{u.confirmed === 'true' ? 'Yes' : <span className="pa-dim">No</span>}</td>
                <td>
                  <button
                    className={`pa-toggle${u.admin === 'true' ? ' pa-toggle--on' : ''}`}
                    onClick={() => setConfirmAdmin(u)}
                    disabled={patching[u.user_id]}
                    aria-label={`Platform admin: ${u.admin === 'true' ? 'Yes' : 'No'} for ${u.username}`}
                  >
                    {u.admin === 'true' ? 'Yes' : 'No'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {confirmAdmin && (
        <div className="pa-modal-backdrop" onClick={() => setConfirmAdmin(null)}>
          <div className="pa-modal" onClick={e => e.stopPropagation()}>
            <div className="pa-modal-title">
              {confirmAdmin.admin === 'true' ? 'Revoke platform admin access' : 'Grant platform admin access'}
            </div>
            <div className="pa-modal-desc">
              {confirmAdmin.admin === 'true'
                ? `Remove platform admin access from ${confirmAdmin.username}? They will no longer be able to manage organizations or users.`
                : `Grant ${confirmAdmin.username} full platform admin access? They will be able to manage all organizations, users, and invites.`}
            </div>
            <div className="pa-modal-actions">
              <button className="pa-btn pa-btn--ghost" onClick={() => setConfirmAdmin(null)}>Cancel</button>
              <button
                className={`pa-btn${confirmAdmin.admin !== 'true' ? ' pa-btn--danger' : ''}`}
                onClick={doTogglePlatformAdmin}
              >
                {confirmAdmin.admin === 'true' ? 'Revoke access' : 'Grant access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Invites Tab ──────────────────────────────────────────────────────────────

function InvitesTab() {
  const [invites, setInvites] = useState([])
  const [orgMap, setOrgMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiGet('/invites'),
      apiGet('/admin/orgs'),
    ]).then(([ivs, orgs]) => {
      setInvites(Array.isArray(ivs) ? ivs.filter(iv => iv.type !== 'student_class') : [])
      const map = {}
      if (Array.isArray(orgs)) orgs.forEach(o => { map[o.org_id] = o.name })
      setOrgMap(map)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="pa-section"><div className="pa-empty">Loading...</div></div>

  return (
    <div className="pa-section">
      <div className="pa-section-header">
        <span className="pa-section-title">Recent invites</span>
      </div>
      {invites.length === 0 ? (
        <div className="pa-empty">No invites yet.</div>
      ) : (
        <table className="pa-table">
          <thead><tr><th>Email</th><th>Org</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {invites.map(iv => (
              <tr key={iv.token}>
                <td>{iv.email || <span className="pa-dim">-</span>}</td>
                <td>{orgMap[iv.org_id] || <span className="pa-dim">{iv.org_id || '-'}</span>}</td>
                <td>{iv.type}</td>
                <td><span className={`pa-status pa-status--${iv.status}`}>{iv.status === 'revoked' ? 'rescinded' : iv.status}</span></td>
                <td className="pa-dim">{iv.created_at ? new Date(iv.created_at).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtYm(ym) {
  const [y, m] = ym.split('-')
  return `${MONTH_ABBR[parseInt(m, 10) - 1]} '${y.slice(2)}`
}

function fmtTs(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function StatCard({ val, label, accent }) {
  return (
    <div className="pa-stat-card" style={accent ? { borderColor: accent + '33', boxShadow: `0 0 0 1px ${accent}22 inset` } : {}}>
      <div className="pa-stat-val" style={accent ? { color: accent } : {}}>{val ?? '-'}</div>
      <div className="pa-stat-label">{label}</div>
    </div>
  )
}

function DonutChart({ segments, size = 148, thickness = 30 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const innerSize = size - thickness * 2
  if (!total) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: innerSize, height: innerSize, borderRadius: '50%', background: '#060F1A' }} />
      </div>
    )
  }
  let cum = 0
  const stops = segments
    .filter(s => s.value > 0)
    .map(seg => {
      const pct = seg.value / total * 100
      const from = cum
      cum += pct
      return `${seg.color} ${from.toFixed(2)}% ${cum.toFixed(2)}%`
    })
    .join(', ')
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${stops})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: innerSize, height: innerSize, borderRadius: '50%', background: '#060F1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e8edf2', lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>total</div>
        </div>
      </div>
    </div>
  )
}

function DonutCard({ title, segments }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  return (
    <div className="pa-chart-card">
      <div className="pa-subsection-title">{title}</div>
      <div className="pa-chart-inner">
        <DonutChart segments={segments} />
        <div className="pa-donut-legend">
          {segments.map(seg => (
            <div key={seg.label} className="pa-legend-row">
              <span className="pa-legend-dot" style={{ background: seg.color }} />
              <span className="pa-legend-label">{seg.label}</span>
              <span className="pa-legend-val">{seg.value}</span>
              {total > 0 && seg.value > 0 && (
                <span className="pa-legend-pct">{Math.round(seg.value / total * 100)}%</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AnalyticsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    apiGet('/admin/analytics')
      .then(d => setData(d))
      .catch(() => setErr('Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="pa-section"><div className="pa-empty">Loading...</div></div>
  if (err) return <div className="pa-section"><div className="pa-error">{err}</div></div>

  const { users, orgs, invites, monthly_signups, recent_audit } = data
  const maxSignups = Math.max(...monthly_signups.map(m => m.count), 1)

  const roleSegments = [
    { label: 'Students',        value: users.by_role.student,        color: '#4ade80' },
    { label: 'Teachers',        value: users.by_role.teacher,        color: '#60a5fa' },
    { label: 'School admins',   value: users.by_role.school_admin,   color: '#c084fc' },
    { label: 'District admins', value: users.by_role.district_admin, color: '#fb923c' },
    { label: 'Personal',        value: users.by_role.personal,       color: '#475569' },
  ]

  const inviteSegments = [
    { label: 'Accepted',  value: invites.accepted,  color: '#4ade80' },
    { label: 'Pending',   value: invites.pending,   color: '#fbbf24' },
    { label: 'Rescinded', value: invites.rescinded, color: '#f87171' },
    { label: 'Expired',   value: invites.expired,   color: '#334155' },
  ]

  const inviteTypeSegments = [
    { label: 'School admin',    value: invites.by_type.school_admin,   color: '#c084fc' },
    { label: 'Teacher',         value: invites.by_type.teacher,        color: '#60a5fa' },
    { label: 'Student join code', value: invites.by_type.student_class, color: '#4ade80' },
  ]

  const BAR_COLORS = ['#60a5fa','#818cf8','#a78bfa','#c084fc','#e879f9','#f472b6']

  return (
    <div className="pa-section">
      {/* Overview stat cards */}
      <div className="pa-stat-grid">
        <StatCard val={orgs.total}          label="Organizations"       accent="#60a5fa" />
        <StatCard val={users.total}         label="Total users"         accent="#c084fc" />
        <StatCard val={users.institutional} label="Institutional users" accent="#4ade80" />
        <StatCard val={invites.pending}     label="Pending invites"     accent="#fbbf24" />
      </div>

      {/* Donut charts row */}
      <div className="pa-three-col">
        <DonutCard title="Users by role" segments={roleSegments} />
        <DonutCard title="Invite status" segments={inviteSegments} />
        <DonutCard title="Invite types"  segments={inviteTypeSegments} />
      </div>

      {/* Monthly signups bar chart */}
      <div className="pa-subsection">
        <div className="pa-subsection-title">Monthly signups (last 6 months)</div>
        <div className="pa-bars">
          {monthly_signups.map((m, i) => (
            <div key={m.ym} className="pa-bar-col">
              {m.count > 0 && <div className="pa-bar-count">{m.count}</div>}
              <div className="pa-bar-fill" style={{
                height: `${Math.round(m.count / maxSignups * 100)}%`,
                background: BAR_COLORS[i % BAR_COLORS.length],
              }} />
              <div className="pa-bar-label">{fmtYm(m.ym)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="pa-subsection">
        <div className="pa-subsection-title">Recent platform activity</div>
        {recent_audit.length === 0 ? (
          <div className="pa-empty">No activity yet.</div>
        ) : (
          <table className="pa-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recent_audit.map((e, i) => (
                <tr key={i}>
                  <td className="pa-dim pa-mono" style={{ whiteSpace: 'nowrap' }}>{fmtTs(e.ts)}</td>
                  <td className="pa-dim" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.user}</td>
                  <td className="pa-mono" style={{ fontSize: 12 }}>{e.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function PlatformAdmin() {
  const [activeTab, setActiveTab] = useState('orgs')

  return (
    <div className="admin-root">
      <HeaderModern page="admin" />
      <div className="admin-page">
        <div className="pa-header">
          <div className="pa-header-title">Platform Admin</div>
          <div className="pa-header-sub">Internal LinkJoin administration</div>
        </div>
        <div className="admin-tabs">
          <button className={`admin-tab${activeTab === 'orgs' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('orgs')}>Organizations</button>
          <button className={`admin-tab${activeTab === 'users' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('users')}>Users</button>
          <button className={`admin-tab${activeTab === 'invites' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('invites')}>Invites</button>
          <button className={`admin-tab${activeTab === 'analytics' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</button>
        </div>
        {activeTab === 'orgs' && <OrgsTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'invites' && <InvitesTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  )
}
