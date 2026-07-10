import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, apiGet, apiPost } from '../api/client.js'
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

  const [tab, setTab] = useState('info')
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
  const [inviteRole, setInviteRole] = useState('school_admin')
  const [inviting, setInviting] = useState(false)
  const [inviteErr, setInviteErr] = useState('')
  const [inviteOk, setInviteOk] = useState(false)

  const [classes, setClasses] = useState([])
  const [classesLoaded, setClassesLoaded] = useState(false)
  const [joinBusy, setJoinBusy] = useState({})
  const [copiedToken, setCopiedToken] = useState(null)

  useEffect(() => {
    Promise.all([
      apiGet(`/admin/orgs/${orgId}`),
      apiGet('/admin/orgs'),
      apiGet(`/admin/orgs/${orgId}/classes`),
    ]).then(([data, orgs, clsList]) => {
      setOrgName(data.name || '')
      setMembers(data.members || [])
      setAllOrgs(Array.isArray(orgs) ? orgs : [])
      setClasses(Array.isArray(clsList) ? clsList : [])
      setClassesLoaded(true)
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
      const isTeacher = inviteRole === 'teacher'
      const body = isTeacher
        ? { type: 'teacher', org_id: orgId, email }
        : { type: 'school_admin', org_id: orgId, email, role: inviteRole }
      await apiFetch('/invites', { method: 'POST', body: JSON.stringify(body) })
      setInviteEmail('')
      setInviteOk(true)
      setTimeout(() => setInviteOk(false), 3000)
    } catch (e) {
      setInviteErr(e?.message || 'Invite failed')
    }
    setInviting(false)
  }

  async function generateJoinCode(cls) {
    setJoinBusy(b => ({ ...b, [cls.class_id]: true }))
    try {
      const inv = await apiPost('/invites', { type: 'student_class', class_id: cls.class_id })
      setClasses(prev => prev.map(c => c.class_id === cls.class_id ? { ...c, join_token: inv.token } : c))
    } catch { /* silent */ }
    setJoinBusy(b => ({ ...b, [cls.class_id]: false }))
  }

  function copyJoinLink(token) {
    const url = `${window.location.origin}/join/${token}`
    navigator.clipboard.writeText(url).catch(() => {})
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(t => t === token ? null : t), 2000)
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
        <div className="pa-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="pa-header-title">{orgName}</div>
            <div className="pa-header-sub">Org ID: {orgId}</div>
          </div>
          <button className="pa-btn pa-btn--ghost" onClick={() => navigate('/platform')}>Back</button>
        </div>

        <div className="admin-tabs">
          <button className={`admin-tab${tab === 'info' ? ' admin-tab--active' : ''}`} onClick={() => setTab('info')}>Info</button>
          <button className={`admin-tab${tab === 'members' ? ' admin-tab--active' : ''}`} onClick={() => setTab('members')}>Members {members.length > 0 && `(${members.length})`}</button>
          <button className={`admin-tab${tab === 'classes' ? ' admin-tab--active' : ''}`} onClick={() => setTab('classes')}>Classes {classes.length > 0 && `(${classes.length})`}</button>
        </div>

        {tab === 'info' && (
          <div className="od-tab-body">
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

            <div className="od-save-row">
              {saveErr && <div className="pa-error" style={{ marginBottom: 8 }}>{saveErr}</div>}
              {savedOk && <div className="pa-success" style={{ marginBottom: 8 }}>Saved</div>}
              <button className="pa-btn" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {tab === 'members' && (
          <div className="od-tab-body">
            <div className="pa-section">
              <div className="pa-section-header">
                <span className="pa-section-title">Invite member</span>
              </div>
              <form className="od-invite-row" onSubmit={sendInvite}>
                <select
                  className="pa-input od-invite-role"
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                >
                  <option value="school_admin">School admin</option>
                  <option value="district_admin">District admin</option>
                  <option value="teacher">Teacher</option>
                </select>
                <input
                  className="pa-input od-invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@school.edu"
                />
                <button className="pa-btn" type="submit" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? '...' : 'Send invite'}
                </button>
              </form>
              {inviteErr && <div className="pa-error" style={{ marginTop: 8 }}>{inviteErr}</div>}
              {inviteOk && <div className="pa-success" style={{ marginTop: 8 }}>Invite sent</div>}
            </div>

            <div className="pa-section">
              <div className="pa-section-title" style={{ marginBottom: 16 }}>Members ({members.length})</div>
              {memberErr && <div className="pa-error" style={{ marginBottom: 12 }}>{memberErr}</div>}
              {members.length === 0 ? (
                <div className="od-empty-state">
                  <div className="od-empty-icon">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>
                  <div className="od-empty-title">No members yet</div>
                  <div className="od-empty-sub">Use the invite form above to add teachers or admins to this org.</div>
                </div>
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
            </div>
          </div>
        )}

        {tab === 'classes' && (
          <div className="od-tab-body">
            <div className="pa-section">
              {classes.length === 0 ? (
                <div className="od-empty-state">
                  <div className="od-empty-icon">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                  </div>
                  <div className="od-empty-title">No classes yet</div>
                  <div className="od-empty-sub">Classes are created by teachers inside the app. They will appear here once added.</div>
                </div>
              ) : (
                <table className="pa-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Teacher</th>
                      <th>Students</th>
                      <th>Student join link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map(cls => (
                      <tr key={cls.class_id}>
                        <td>{cls.name}</td>
                        <td className="pa-dim">{cls.teacher_id}</td>
                        <td className="pa-dim">{(cls.student_ids || []).length}</td>
                        <td>
                          {cls.join_token ? (
                            <button className="od-copy-btn" onClick={() => copyJoinLink(cls.join_token)}>
                              {copiedToken === cls.join_token ? 'Copied!' : 'Copy link'}
                            </button>
                          ) : (
                            <button
                              className="od-copy-btn od-copy-btn--generate"
                              disabled={joinBusy[cls.class_id]}
                              onClick={() => generateJoinCode(cls)}
                            >
                              {joinBusy[cls.class_id] ? '...' : 'Generate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
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
