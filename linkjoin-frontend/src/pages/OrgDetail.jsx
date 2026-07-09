import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, apiGet } from '../api/client.js'
import HeaderModern from '../components/HeaderModern.jsx'
import '../styles/platform-admin.css'
import '../styles/create-org.css'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern Time (America/New_York)' },
  { value: 'America/Chicago',     label: 'Central Time (America/Chicago)' },
  { value: 'America/Denver',      label: 'Mountain Time (America/Denver)' },
  { value: 'America/Phoenix',     label: 'Mountain Time – no DST (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (America/Los_Angeles)' },
  { value: 'America/Anchorage',   label: 'Alaska Time (America/Anchorage)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (Pacific/Honolulu)' },
  { value: 'America/Puerto_Rico', label: 'Atlantic Time (America/Puerto_Rico)' },
  { value: 'Europe/London',       label: 'Greenwich Mean Time (Europe/London)' },
  { value: 'Europe/Paris',        label: 'Central European Time (Europe/Paris)' },
  { value: 'Asia/Tokyo',          label: 'Japan Standard Time (Asia/Tokyo)' },
  { value: 'Asia/Shanghai',       label: 'China Standard Time (Asia/Shanghai)' },
  { value: 'Asia/Kolkata',        label: 'India Standard Time (Asia/Kolkata)' },
  { value: 'Australia/Sydney',    label: 'Australian Eastern Time (Australia/Sydney)' },
]

const GRADE_OPTIONS = ['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12']

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))

const ROLE_LABELS = {
  student: 'Student',
  teacher: 'Teacher',
  school_admin: 'School Admin',
  district_admin: 'District Admin',
}

function Section({ title, children }) {
  return (
    <div className="co-section">
      <div className="co-section-title">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, hint, children, half }) {
  return (
    <div className={`co-field${half ? ' co-field--half' : ''}`}>
      <label className="pa-label">{label}</label>
      {children}
      {hint && <div className="co-hint">{hint}</div>}
    </div>
  )
}

export default function OrgDetail() {
  const { orgId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [members, setMembers] = useState([])
  const [allOrgs, setAllOrgs] = useState([])

  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [savedOk, setSavedOk] = useState(false)

  const [memberBusy, setMemberBusy] = useState({})
  const [memberErr, setMemberErr] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteErr, setInviteErr] = useState('')
  const [inviteOk, setInviteOk] = useState(false)

  useEffect(() => {
    Promise.all([
      apiGet(`/admin/orgs/${orgId}`),
      apiGet('/admin/orgs'),
    ]).then(([data, orgs]) => {
      setOrgName(data.name || '')
      setMembers(data.members || [])
      setAllOrgs(Array.isArray(orgs) ? orgs : [])
      setForm({
        name: data.name || '',
        type: data.type || 'school',
        parent_org_id: data.parent_org_id || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        zip_code: data.zip_code || '',
        website: data.website || '',
        phone: data.phone || '',
        timezone: data.timezone || '',
        grade_levels: data.grade_levels || [],
        school_year_start_month: data.school_year_start?.split(' ')[0] || 'August',
        school_year_start_day: data.school_year_start?.split(' ')[1] || '15',
        school_year_end_month: data.school_year_end?.split(' ')[0] || 'June',
        school_year_end_day: data.school_year_end?.split(' ')[1] || '10',
      })
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [orgId])

  function set(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function toggleGrade(g) {
    setForm(prev => ({
      ...prev,
      grade_levels: prev.grade_levels.includes(g)
        ? prev.grade_levels.filter(x => x !== g)
        : [...prev.grade_levels, g],
    }))
  }

  async function save() {
    if (!form.name.trim()) { setSaveErr('Name is required'); return }
    setSaving(true); setSaveErr(''); setSavedOk(false)
    try {
      await apiFetch(`/admin/orgs/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          parent_org_id: form.parent_org_id || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          state: form.state || null,
          zip_code: form.zip_code.trim() || null,
          website: form.website.trim() || null,
          phone: form.phone.trim() || null,
          timezone: form.timezone || null,
          grade_levels: form.grade_levels.length ? form.grade_levels : null,
          school_year_start: `${form.school_year_start_month} ${form.school_year_start_day}`,
          school_year_end: `${form.school_year_end_month} ${form.school_year_end_day}`,
        }),
      })
      setOrgName(form.name.trim())
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) {
      setSaveErr(e?.message || 'Save failed')
    }
    setSaving(false)
  }

  async function changeRole(member, role) {
    setMemberBusy(b => ({ ...b, [member.user_id]: true }))
    setMemberErr('')
    try {
      await apiFetch(`/admin/orgs/${orgId}/members/${member.user_id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, role } : m))
    } catch (e) {
      setMemberErr(e?.message || 'Role update failed')
    }
    setMemberBusy(b => ({ ...b, [member.user_id]: false }))
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.username} from this org?`)) return
    setMemberBusy(b => ({ ...b, [member.user_id]: true }))
    setMemberErr('')
    try {
      await apiFetch(`/admin/orgs/${orgId}/members/${member.user_id}`, { method: 'DELETE' })
      setMembers(prev => prev.filter(m => m.user_id !== member.user_id))
    } catch (e) {
      setMemberErr(e?.message || 'Remove failed')
    }
    setMemberBusy(b => ({ ...b, [member.user_id]: false }))
  }

  async function sendInvite(e) {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setInviting(true); setInviteErr(''); setInviteOk(false)
    try {
      await apiFetch('/invites', {
        method: 'POST',
        body: JSON.stringify({ type: 'school_admin', org_id: orgId, email }),
      })
      setInviteEmail('')
      setInviteOk(true)
      setTimeout(() => setInviteOk(false), 3000)
    } catch (e) {
      setInviteErr(e?.message || 'Invite failed')
    }
    setInviting(false)
  }

  if (loading) {
    return (
      <div className="admin-root">
        <HeaderModern page="admin" />
        <div className="admin-page"><div className="pa-empty">Loading...</div></div>
      </div>
    )
  }

  if (notFound || !form) {
    return (
      <div className="admin-root">
        <HeaderModern page="admin" />
        <div className="admin-page">
          <div className="pa-empty">Organization not found.</div>
          <button className="pa-btn" style={{ marginTop: 16 }} onClick={() => navigate('/platform')}>Back</button>
        </div>
      </div>
    )
  }

  const districtOrgs = allOrgs.filter(o => o.type === 'district' && o.org_id !== orgId)

  return (
    <div className="admin-root">
      <HeaderModern page="admin" />
      <div className="admin-page">
        <div className="co-topbar">
          <h1 className="co-page-title">{orgName}</h1>
          <p className="co-page-sub">Org ID: {orgId}</p>
        </div>

        <div className="co-body">
          <div className="co-main">

            <Section title="Organization details">
              <div className="co-row">
                <Field label="Name *">
                  <input className="pa-input" value={form.name} onChange={e => set('name', e.target.value)} />
                </Field>
                <Field label="Type" half>
                  <div className="co-type-group">
                    {['school', 'district'].map(t => (
                      <button key={t} className={`co-type-btn${form.type === t ? ' co-type-btn--active' : ''}`} onClick={() => set('type', t)}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              {districtOrgs.length > 0 && (
                <Field label="Parent district" hint="Optional — link this school to an existing district.">
                  <select className="pa-input" value={form.parent_org_id} onChange={e => set('parent_org_id', e.target.value)}>
                    <option value="">None</option>
                    {districtOrgs.map(o => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
                  </select>
                </Field>
              )}
            </Section>

            <Section title="Location">
              <Field label="Street address">
                <input className="pa-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="1234 Oak Street" />
              </Field>
              <div className="co-row co-row--3">
                <Field label="City">
                  <input className="pa-input" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Springfield" />
                </Field>
                <Field label="State">
                  <select className="pa-input" value={form.state} onChange={e => set('state', e.target.value)}>
                    <option value="">--</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="ZIP">
                  <input className="pa-input" value={form.zip_code} onChange={e => set('zip_code', e.target.value)} placeholder="90210" />
                </Field>
              </div>
            </Section>

            <Section title="Contact">
              <div className="co-row">
                <Field label="Website">
                  <input className="pa-input" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://lincoln.edu" />
                </Field>
                <Field label="Phone">
                  <input className="pa-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" />
                </Field>
              </div>
            </Section>

            <Section title="Academic settings">
              <Field label="Timezone">
                <select className="pa-input" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  <option value="">Select timezone</option>
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </Field>
              <Field label="Grade levels" hint="Select all grades this school serves.">
                <div className="co-grade-grid">
                  {GRADE_OPTIONS.map(g => (
                    <button key={g} className={`co-grade-btn${form.grade_levels.includes(g) ? ' co-grade-btn--on' : ''}`} onClick={() => toggleGrade(g)} type="button">
                      {g}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="co-row">
                <Field label="School year start">
                  <div className="co-date-row">
                    <select className="pa-input" value={form.school_year_start_month} onChange={e => set('school_year_start_month', e.target.value)}>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="pa-input co-day-select" value={form.school_year_start_day} onChange={e => set('school_year_start_day', e.target.value)}>
                      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </Field>
                <Field label="School year end">
                  <div className="co-date-row">
                    <select className="pa-input" value={form.school_year_end_month} onChange={e => set('school_year_end_month', e.target.value)}>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="pa-input co-day-select" value={form.school_year_end_day} onChange={e => set('school_year_end_day', e.target.value)}>
                      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </Field>
              </div>
            </Section>

            <Section title={`Members (${members.length})`}>
              {memberErr && <div className="pa-error" style={{ marginBottom: 12 }}>{memberErr}</div>}
              {members.length === 0 ? (
                <div className="pa-empty">No members yet.</div>
              ) : (
                <table className="pa-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Confirmed</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.user_id}>
                        <td>{m.username}</td>
                        <td>
                          <select
                            className="pa-input od-role-select"
                            value={m.role || ''}
                            disabled={!!memberBusy[m.user_id]}
                            onChange={e => changeRole(m, e.target.value)}
                          >
                            {Object.entries(ROLE_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        </td>
                        <td>{m.confirmed === 'true' ? 'Yes' : <span className="pa-dim">No</span>}</td>
                        <td>
                          <button
                            className="od-remove-btn"
                            disabled={!!memberBusy[m.user_id]}
                            onClick={() => removeMember(m)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

          </div>

          <div className="co-sidebar">
            <div className="co-sidebar-card co-sidebar-summary">
              <div className="co-sidebar-title">Summary</div>
              <div className="co-summary-row">
                <span className="co-summary-label">Name</span>
                <span className="co-summary-val">{form.name || <span className="pa-dim">--</span>}</span>
              </div>
              <div className="co-summary-row">
                <span className="co-summary-label">Type</span>
                <span className="co-summary-val">{form.type}</span>
              </div>
              {form.city && (
                <div className="co-summary-row">
                  <span className="co-summary-label">Location</span>
                  <span className="co-summary-val">{[form.city, form.state].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="co-summary-row">
                <span className="co-summary-label">Members</span>
                <span className="co-summary-val">{members.length}</span>
              </div>
            </div>

            <div className="co-sidebar-card">
              <div className="co-sidebar-title">Invite school admin</div>
              <form onSubmit={sendInvite}>
                <input
                  className="pa-input"
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="principal@school.edu"
                  style={{ marginBottom: 10 }}
                />
                {inviteErr && <div className="pa-error" style={{ marginBottom: 8 }}>{inviteErr}</div>}
                {inviteOk && <div className="pa-success" style={{ marginBottom: 8 }}>Invite sent</div>}
                <button className="pa-btn co-submit-btn" type="submit" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? 'Sending...' : 'Send invite'}
                </button>
              </form>
            </div>

            {saveErr && <div className="pa-error">{saveErr}</div>}
            {savedOk && <div className="pa-success">Saved</div>}

            <button
              className="pa-btn co-submit-btn"
              onClick={save}
              disabled={saving || !form.name.trim()}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button className="pa-btn pa-btn--ghost co-cancel-btn" onClick={() => navigate('/platform')}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
