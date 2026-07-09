import { useState, useEffect, useCallback } from 'react'
import { apiFetch, apiGet, apiPatch } from '../api/client.js'
import HeaderModern from '../components/HeaderModern.jsx'
import '../styles/platform-admin.css'

function adminFetch(path, opts = {}) {
  return apiFetch(path, opts)
}

// ─── Orgs Tab ─────────────────────────────────────────────────────────────────

function OrgsTab() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('pa_tok') || '')
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(null) // null | 'org' | 'invite'
  const [newOrg, setNewOrg] = useState({ name: '', type: 'school' })
  const [creating, setCreating] = useState(false)
  const [createdOrgId, setCreatedOrgId] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteOk, setInviteOk] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    apiGet('/admin/orgs')
      .then(data => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false))
  }, [])

  async function createOrg() {
    if (!newOrg.name.trim()) { setErr('Name is required'); return }
    if (!adminToken.trim()) { setErr('Admin token is required'); return }
    setCreating(true); setErr('')
    try {
      const res = await apiFetch('/orgs', {
        method: 'POST',
        body: JSON.stringify({ name: newOrg.name, type: newOrg.type }),
        headers: { 'X-Admin-Token': adminToken },
      })
      sessionStorage.setItem('pa_tok', adminToken)
      setCreatedOrgId(res.org_id)
      setOrgs(prev => [res, ...prev])
      setShowCreate('invite')
    } catch (e) {
      setErr(e?.message || 'Failed to create org')
    }
    setCreating(false)
  }

  async function sendSchoolAdminInvite() {
    if (!inviteEmail.trim()) { setErr('Email is required'); return }
    setInviting(true); setErr('')
    try {
      await apiFetch('/invites', {
        method: 'POST',
        body: JSON.stringify({ type: 'school_admin', org_id: createdOrgId, email: inviteEmail.trim() }),
        headers: { 'X-Admin-Token': adminToken },
      })
      setInviteOk(true)
      setTimeout(() => {
        setInviteOk(false); setShowCreate(null)
        setNewOrg({ name: '', type: 'school' }); setInviteEmail(''); setCreatedOrgId(null)
      }, 2000)
    } catch (e) {
      setErr(e?.message || 'Failed to send invite')
    }
    setInviting(false)
  }

  return (
    <div className="pa-section">
      <div className="pa-section-header">
        <span className="pa-section-title">Organizations</span>
        <button className="pa-btn" onClick={() => { setShowCreate('org'); setErr('') }}>+ Create org</button>
      </div>

      {showCreate === 'org' && (
        <div className="pa-modal-backdrop" onClick={() => setShowCreate(null)}>
          <div className="pa-modal" onClick={e => e.stopPropagation()}>
            <div className="pa-modal-title">Create organization</div>
            <div className="pa-field">
              <label className="pa-label">Name</label>
              <input className="pa-input" value={newOrg.name} onChange={e => setNewOrg(p => ({ ...p, name: e.target.value }))} placeholder="Lincoln High School" />
            </div>
            <div className="pa-field">
              <label className="pa-label">Type</label>
              <select className="pa-input" value={newOrg.type} onChange={e => setNewOrg(p => ({ ...p, type: e.target.value }))}>
                <option value="school">School</option>
                <option value="district">District</option>
              </select>
            </div>
            <div className="pa-field">
              <label className="pa-label">Admin token</label>
              <input className="pa-input" type="password" value={adminToken} onChange={e => setAdminToken(e.target.value)} placeholder="X-Admin-Token value" />
            </div>
            {err && <div className="pa-error">{err}</div>}
            <div className="pa-modal-actions">
              <button className="pa-btn pa-btn--ghost" onClick={() => setShowCreate(null)}>Cancel</button>
              <button className="pa-btn" onClick={createOrg} disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {showCreate === 'invite' && (
        <div className="pa-modal-backdrop" onClick={() => setShowCreate(null)}>
          <div className="pa-modal" onClick={e => e.stopPropagation()}>
            <div className="pa-modal-title">Invite school administrator</div>
            <p className="pa-modal-desc">Send an invite to the person who will manage this school.</p>
            <div className="pa-field">
              <label className="pa-label">Email</label>
              <input className="pa-input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="admin@school.edu" />
            </div>
            {err && <div className="pa-error">{err}</div>}
            {inviteOk && <div className="pa-success">Invite sent!</div>}
            <div className="pa-modal-actions">
              <button className="pa-btn pa-btn--ghost" onClick={() => setShowCreate(null)}>Skip</button>
              <button className="pa-btn" onClick={sendSchoolAdminInvite} disabled={inviting}>{inviting ? 'Sending...' : 'Send invite'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="pa-empty">Loading...</div>
      ) : orgs.length === 0 ? (
        <div className="pa-empty">No organizations yet. Create one to get started.</div>
      ) : (
        <table className="pa-table">
          <thead><tr><th>Name</th><th>Type</th><th>Org ID</th></tr></thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.org_id}>
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
