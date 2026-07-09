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
        <button className="pa-btn" onClick={() => navigate('/platform/orgs/new')}>+ Create org</button>
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
  const [loading, setLoading] = useState(false)
  const [patching, setPatching] = useState({})
  const [err, setErr] = useState('')

  async function search(e) {
    e.preventDefault()
    if (!q.trim()) return
    setLoading(true); setErr(''); setResults(null)
    try {
      const data = await apiGet(`/admin/users/search?q=${encodeURIComponent(q.trim())}`)
      setResults(Array.isArray(data) ? data : [data])
    } catch (e) {
      setErr(e?.detail || 'Search failed')
    }
    setLoading(false)
  }

  async function togglePlatformAdmin(u) {
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
      </div>
      <form className="pa-search-row" onSubmit={search}>
        <input className="pa-input pa-search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by email..." />
        <button className="pa-btn" type="submit" disabled={loading}>{loading ? '...' : 'Search'}</button>
      </form>
      {err && <div className="pa-error">{err}</div>}
      {results && (results.length === 0 ? (
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
                    onClick={() => togglePlatformAdmin(u)}
                    disabled={patching[u.user_id]}
                  >
                    {u.admin === 'true' ? 'Yes' : 'No'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}

// ─── Invites Tab ──────────────────────────────────────────────────────────────

function InvitesTab() {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/invites')
      .then(data => setInvites(Array.isArray(data) ? data : []))
      .catch(() => setInvites([]))
      .finally(() => setLoading(false))
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
          <thead><tr><th>Email</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {invites.map(iv => (
              <tr key={iv.token}>
                <td>{iv.email || <span className="pa-dim">(join code)</span>}</td>
                <td>{iv.type}</td>
                <td><span className={`pa-status pa-status--${iv.status}`}>{iv.status}</span></td>
                <td className="pa-dim">{iv.created_at ? new Date(iv.created_at).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
        </div>
        {activeTab === 'orgs' && <OrgsTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'invites' && <InvitesTab />}
      </div>
    </div>
  )
}
