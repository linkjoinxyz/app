import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

const GRADE_OPTIONS = ['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12']

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))

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

export default function CreateOrg() {
  const navigate = useNavigate()
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('pa_tok') || '')
  const [existingOrgs, setExistingOrgs] = useState([])

  const [form, setForm] = useState({
    name: '',
    type: 'school',
    parent_org_id: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    website: '',
    phone: '',
    timezone: '',
    grade_levels: [],
    school_year_start_month: 'August',
    school_year_start_day: '15',
    school_year_end_month: 'June',
    school_year_end_day: '10',
    admin_email: '',
  })

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    apiGet('/admin/orgs').then(data => setExistingOrgs(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

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

  async function submit() {
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!adminToken.trim()) { setErr('Admin token is required'); return }
    setSaving(true); setErr('')
    try {
      const payload = {
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
      }
      const org = await apiFetch('/orgs', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'X-Admin-Token': adminToken },
      })
      sessionStorage.setItem('pa_tok', adminToken)

      if (form.admin_email.trim()) {
        await apiFetch('/invites', {
          method: 'POST',
          body: JSON.stringify({ type: 'school_admin', org_id: org.org_id, email: form.admin_email.trim().toLowerCase() }),
          headers: { 'X-Admin-Token': adminToken },
        })
      }

      navigate('/platform')
    } catch (e) {
      setErr(e?.message || 'Failed to create organization')
    }
    setSaving(false)
  }

  const districtOrgs = existingOrgs.filter(o => o.type === 'district')

  return (
    <div className="admin-root">
      <HeaderModern page="admin" />
      <div className="admin-page">
        <div className="co-topbar">
          <button className="co-back" onClick={() => navigate('/platform')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Platform Admin
          </button>
          <h1 className="co-page-title">Create Organization</h1>
          <p className="co-page-sub">Set up a new school or district on LinkJoin.</p>
        </div>

        <div className="co-body">
          <div className="co-main">

            <Section title="Organization details">
              <div className="co-row">
                <Field label="Name *">
                  <input className="pa-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Lincoln High School" autoFocus />
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
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', 'Pacific/').replace(/_/g, ' ')}</option>)}
                </select>
              </Field>

              <Field label="Grade levels" hint="Select all grades this school serves.">
                <div className="co-grade-grid">
                  {GRADE_OPTIONS.map(g => (
                    <button
                      key={g}
                      className={`co-grade-btn${form.grade_levels.includes(g) ? ' co-grade-btn--on' : ''}`}
                      onClick={() => toggleGrade(g)}
                      type="button"
                    >
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

            <Section title="Administrator">
              <Field label="Admin email" hint="This person will receive an invite to set up and manage the organization. You can skip this and invite them later.">
                <input className="pa-input" type="email" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} placeholder="principal@school.edu" />
              </Field>
            </Section>

          </div>

          <div className="co-sidebar">
            <div className="co-sidebar-card">
              <div className="co-sidebar-title">Admin token</div>
              <div className="co-sidebar-desc">Required to create organizations. This is the <code>X-Admin-Token</code> from your backend config.</div>
              <input className="pa-input" type="password" value={adminToken} onChange={e => setAdminToken(e.target.value)} placeholder="Token" autoComplete="off" />
            </div>

            <div className="co-sidebar-card co-sidebar-summary">
              <div className="co-sidebar-title">Summary</div>
              <div className="co-summary-row">
                <span className="co-summary-label">Name</span>
                <span className="co-summary-val">{form.name || <span className="pa-dim">—</span>}</span>
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
              {form.grade_levels.length > 0 && (
                <div className="co-summary-row">
                  <span className="co-summary-label">Grades</span>
                  <span className="co-summary-val">{form.grade_levels.join(', ')}</span>
                </div>
              )}
              {form.admin_email && (
                <div className="co-summary-row">
                  <span className="co-summary-label">Admin</span>
                  <span className="co-summary-val">{form.admin_email}</span>
                </div>
              )}
            </div>

            {err && <div className="pa-error">{err}</div>}

            <button className="pa-btn co-submit-btn" onClick={submit} disabled={saving || !form.name.trim() || !adminToken.trim()}>
              {saving ? 'Creating...' : 'Create organization'}
            </button>
            <button className="pa-btn pa-btn--ghost co-cancel-btn" onClick={() => navigate('/platform')}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
