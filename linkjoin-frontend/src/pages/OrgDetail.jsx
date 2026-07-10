import { useState, useEffect, useId, Children, cloneElement } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, apiGet, apiPost, apiDelete } from '../api/client.js'
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

function ConfirmModal({ title, body, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel, busy }) {
  return (
    <div className="pa-modal-backdrop" onClick={onCancel}>
      <div className="pa-modal" onClick={e => e.stopPropagation()}>
        <div className="pa-modal-title">{title}</div>
        {body && <div className="pa-modal-desc">{body}</div>}
        <div className="pa-modal-actions">
          <button className="pa-btn pa-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`pa-btn${danger ? ' pa-btn--danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const IMPORT_ROLE_LABELS = { teacher: 'Teacher', school_admin: 'School Admin', district_admin: 'District Admin', parent: 'Parent/Guardian' }

function ImportModal({ orgName, importRole, setImportRole, importRows, setImportRows, importBusy, importResults, importErr, parseImportCSV, onSubmit, onClose }) {
  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseImportCSV(ev.target.result)
      setImportRows(rows)
    }
    reader.readAsText(file)
  }

  function handlePaste(e) {
    const text = e.clipboardData?.getData('text') || ''
    if (text.trim()) {
      e.preventDefault()
      const rows = parseImportCSV(text)
      setImportRows(rows)
    }
  }

  const created = importResults ? importResults.filter(r => r.status === 'created').length : 0
  const updated = importResults ? importResults.filter(r => r.status === 'updated').length : 0
  const errors = importResults ? importResults.filter(r => r.status === 'error') : []

  return (
    <div className="pa-modal-backdrop" onClick={onClose}>
      <div className="pa-modal od-import-modal" onClick={e => e.stopPropagation()}>
        <div className="pa-modal-title">Bulk import members</div>
        <div className="pa-modal-desc" style={{ marginBottom: 16 }}>
          Import staff accounts for <strong>{orgName}</strong>. Each person will receive a welcome email with a temporary password.
        </div>

        {!importResults ? (
          <>
            <div className="od-import-format">
              <strong>CSV format:</strong> email, role (optional), first_name (optional), last_name (optional)<br />
              <span className="pa-dim">Roles: teacher, school_admin, district_admin, parent</span>
            </div>

            <div className="od-import-role-row">
              <label className="pa-label" style={{ marginBottom: 4 }}>Default role (used when CSV has no role column)</label>
              <select className="pa-input" value={importRole} onChange={e => setImportRole(e.target.value)}>
                {Object.entries(IMPORT_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div className="od-import-drop" onPaste={handlePaste}>
              <input type="file" accept=".csv,.txt" id="od-csv-file" style={{ display: 'none' }} onChange={handleFile} />
              <label htmlFor="od-csv-file" className="od-import-drop-label">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Click to choose a CSV file, or paste CSV data here</span>
              </label>
            </div>

            {importRows.length > 0 && (
              <div className="od-import-preview">
                <div className="od-import-preview-header">Preview: {importRows.length} row{importRows.length !== 1 ? 's' : ''}</div>
                <table className="pa-table" style={{ marginTop: 8 }}>
                  <thead><tr><th>Email</th><th>Role</th><th>Name</th></tr></thead>
                  <tbody>
                    {importRows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td>{r.email}</td>
                        <td>{IMPORT_ROLE_LABELS[r.role] || r.role}</td>
                        <td className="pa-dim">{[r.first_name, r.last_name].filter(Boolean).join(' ') || <em>not provided</em>}</td>
                      </tr>
                    ))}
                    {importRows.length > 8 && <tr><td colSpan={3} className="pa-dim">...and {importRows.length - 8} more</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {importErr && <div className="pa-error" style={{ marginTop: 12 }}>{importErr}</div>}

            <div className="pa-modal-actions">
              <button className="pa-btn pa-btn--ghost" onClick={onClose} disabled={importBusy}>Cancel</button>
              <button className="pa-btn" onClick={onSubmit} disabled={importBusy || importRows.length === 0}>
                {importBusy ? 'Importing...' : `Import ${importRows.length > 0 ? importRows.length + ' ' : ''}account${importRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="od-import-results">
              {created > 0 && <div className="od-import-stat od-import-stat--ok">{created} account{created !== 1 ? 's' : ''} created</div>}
              {updated > 0 && <div className="od-import-stat od-import-stat--info">{updated} existing account{updated !== 1 ? 's' : ''} updated</div>}
              {errors.length > 0 && (
                <>
                  <div className="od-import-stat od-import-stat--err">{errors.length} error{errors.length !== 1 ? 's' : ''}</div>
                  <ul className="od-import-errors">
                    {errors.map((e, i) => <li key={i}><strong>{e.email}</strong>: {e.error}</li>)}
                  </ul>
                </>
              )}
            </div>
            <div className="pa-modal-actions">
              <button className="pa-btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ParentImportModal({ orgName, rows, setRows, busy, results, err, parseCSV, onSubmit, onClose }) {
  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setRows(parseCSV(ev.target.result))
    reader.readAsText(file)
  }

  function handlePaste(e) {
    const text = e.clipboardData?.getData('text') || ''
    if (text.trim()) { e.preventDefault(); setRows(parseCSV(text)) }
  }

  const created = results ? results.filter(r => r.status === 'created').length : 0
  const updated = results ? results.filter(r => r.status === 'updated').length : 0
  const errors = results ? results.filter(r => r.status === 'error') : []

  return (
    <div className="pa-modal-backdrop" onClick={onClose}>
      <div className="pa-modal od-import-modal" onClick={e => e.stopPropagation()}>
        <div className="pa-modal-title">Import parent accounts</div>
        <div className="pa-modal-desc" style={{ marginBottom: 16 }}>
          Link parent/guardian accounts to student accounts for <strong>{orgName}</strong>. Each new parent receives a welcome email with portal access.
        </div>

        {!results ? (
          <>
            <div className="od-import-format">
              <strong>CSV format:</strong> parent_email, student_email (one row per relationship)<br />
              <span className="pa-dim">Students must already have accounts in the system.</span>
            </div>

            <div className="od-import-drop" onPaste={handlePaste}>
              <input type="file" accept=".csv,.txt" id="od-parent-csv-file" style={{ display: 'none' }} onChange={handleFile} />
              <label htmlFor="od-parent-csv-file" className="od-import-drop-label">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Click to choose a CSV file, or paste CSV data here</span>
              </label>
            </div>

            {rows.length > 0 && (
              <div className="od-import-preview">
                <div className="od-import-preview-header">Preview: {rows.length} relationship{rows.length !== 1 ? 's' : ''}</div>
                <table className="pa-table" style={{ marginTop: 8 }}>
                  <thead><tr><th>Parent email</th><th>Student email</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i}><td>{r.parent_email}</td><td className="pa-dim">{r.student_email}</td></tr>
                    ))}
                    {rows.length > 8 && <tr><td colSpan={2} className="pa-dim">...and {rows.length - 8} more</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {err && <div className="pa-error" style={{ marginTop: 12 }}>{err}</div>}

            <div className="pa-modal-actions">
              <button className="pa-btn pa-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="pa-btn" onClick={onSubmit} disabled={busy || rows.length === 0}>
                {busy ? 'Importing...' : `Import ${rows.length > 0 ? rows.length + ' ' : ''}relationship${rows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="od-import-results">
              {created > 0 && <div className="od-import-stat od-import-stat--ok">{created} parent account{created !== 1 ? 's' : ''} created</div>}
              {updated > 0 && <div className="od-import-stat od-import-stat--info">{updated} existing account{updated !== 1 ? 's' : ''} updated</div>}
              {errors.length > 0 && (
                <>
                  <div className="od-import-stat od-import-stat--err">{errors.length} error{errors.length !== 1 ? 's' : ''}</div>
                  <ul className="od-import-errors">
                    {errors.map((e, i) => <li key={i}><strong>{e.parent_email}</strong> / {e.student_email}: {e.error}</li>)}
                  </ul>
                </>
              )}
            </div>
            <div className="pa-modal-actions">
              <button className="pa-btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
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
  const id = useId()
  const arr = Children.toArray(children)
  const isSimple = arr.length === 1 && (arr[0].type === 'input' || arr[0].type === 'select')
  return (
    <div className={`co-field${half ? ' co-field--half' : ''}`}>
      <label className="pa-label" htmlFor={isSimple ? id : undefined}>{label}</label>
      {isSimple ? cloneElement(arr[0], { id }) : children}
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

  const [isDirty, setIsDirty] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  const [importModal, setImportModal] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importRole, setImportRole] = useState('teacher')
  const [importBusy, setImportBusy] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [importErr, setImportErr] = useState('')

  const [parentImportModal, setParentImportModal] = useState(false)
  const [parentImportRows, setParentImportRows] = useState([])
  const [parentImportBusy, setParentImportBusy] = useState(false)
  const [parentImportResults, setParentImportResults] = useState(null)
  const [parentImportErr, setParentImportErr] = useState('')

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
    setIsDirty(true)
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
      setIsDirty(false)
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
    setConfirmRemove(member)
  }

  async function doRemoveMember() {
    const member = confirmRemove
    setConfirmRemove(null)
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

  async function deleteOrg() {
    setDeleting(true)
    setDeleteErr('')
    try {
      await apiDelete(`/admin/orgs/${orgId}`)
      navigate('/platform')
    } catch (e) {
      setDeleteErr(e?.message || 'Delete failed')
      setDeleting(false)
      setConfirmDelete(false)
    }
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

  const [joinErr, setJoinErr] = useState({})

  async function generateJoinCode(cls) {
    setJoinBusy(b => ({ ...b, [cls.class_id]: true }))
    setJoinErr(e => ({ ...e, [cls.class_id]: '' }))
    try {
      const inv = await apiPost('/invites', { type: 'student_class', class_id: cls.class_id })
      setClasses(prev => prev.map(c => c.class_id === cls.class_id ? { ...c, join_token: inv.token } : c))
    } catch (e) {
      setJoinErr(err => ({ ...err, [cls.class_id]: e?.message || 'Failed to generate code' }))
    }
    setJoinBusy(b => ({ ...b, [cls.class_id]: false }))
  }

  function copyJoinLink(token) {
    const url = `${window.location.origin}/join/${token}`
    navigator.clipboard.writeText(url).catch(() => {})
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(t => t === token ? null : t), 2000)
  }

  function parseImportCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
    if (!lines.length) return []
    const firstLower = lines[0].toLowerCase()
    const hasHeader = firstLower.includes('email') || firstLower.includes('first') || firstLower.includes('last') || firstLower.includes('role')
    const dataLines = hasHeader ? lines.slice(1) : lines
    return dataLines.map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const email = cols[0] || ''
      const roleCol = (cols[1] || '').toLowerCase()
      const validRole = ['teacher', 'school_admin', 'district_admin', 'parent'].includes(roleCol)
      const first_name = cols[validRole ? 2 : 1] || ''
      const last_name = cols[validRole ? 3 : 2] || ''
      return { email, role: validRole ? roleCol : importRole, first_name, last_name }
    }).filter(r => r.email)
  }

  async function submitImport() {
    setImportBusy(true)
    setImportErr('')
    try {
      const data = await apiPost(`/admin/orgs/${orgId}/import`, { rows: importRows })
      setImportResults(data.results || [])
      const created = (data.results || []).filter(r => r.status === 'created').length
      if (created > 0) {
        const fresh = await apiGet(`/admin/orgs/${orgId}`)
        setMembers(fresh.members || [])
      }
    } catch (e) {
      setImportErr(e?.message || 'Import failed')
    }
    setImportBusy(false)
  }

  function closeImportModal() {
    setImportModal(false)
    setImportRows([])
    setImportResults(null)
    setImportErr('')
  }

  function parseParentCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
    if (!lines.length) return []
    const firstLower = lines[0].toLowerCase()
    const hasHeader = firstLower.includes('parent') || firstLower.includes('student')
    const dataLines = hasHeader ? lines.slice(1) : lines
    return dataLines.map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      return { parent_email: cols[0] || '', student_email: cols[1] || '' }
    }).filter(r => r.parent_email && r.student_email)
  }

  async function submitParentImport() {
    setParentImportBusy(true)
    setParentImportErr('')
    try {
      const data = await apiPost(`/admin/orgs/${orgId}/import-parents`, { rows: parentImportRows })
      setParentImportResults(data.results || [])
    } catch (e) {
      setParentImportErr(e?.message || 'Import failed')
    }
    setParentImportBusy(false)
  }

  function closeParentImportModal() {
    setParentImportModal(false)
    setParentImportRows([])
    setParentImportResults(null)
    setParentImportErr('')
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
          <button className="pa-btn pa-btn--ghost" onClick={() => isDirty ? setConfirmLeave(true) : navigate('/platform')}>Back</button>
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

            {savedOk && <div className="pa-success" style={{ marginTop: 16 }}>Changes saved</div>}
            {saveErr && <div className="pa-error" style={{ marginTop: 16 }}>{saveErr}</div>}

            <div className="od-danger-zone">
              <div className="od-danger-title">Danger zone</div>
              {deleteErr && <div className="pa-error" style={{ marginBottom: 10 }}>{deleteErr}</div>}
              <div className="od-danger-row">
                <div>
                  <div className="od-danger-label">Delete this organization</div>
                  <div className="od-danger-sub">Removes the org and disconnects all {members.length} member{members.length !== 1 ? 's' : ''}. This cannot be undone.</div>
                </div>
                <button className="pa-btn pa-btn--danger" onClick={() => setConfirmDelete(true)}>Delete org</button>
              </div>
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
                  {inviting ? 'Sending...' : 'Send invite'}
                </button>
              </form>
              {inviteErr && <div className="pa-error" style={{ marginTop: 8 }}>{inviteErr}</div>}
              {inviteOk && <div className="pa-success" style={{ marginTop: 8 }}>Invite sent</div>}

              <div className="od-student-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>
                  <strong>Adding students:</strong> Students join via class join codes, not email invites.
                  Add teachers first, then teachers create classes, then use the{' '}
                  <button className="od-tab-link" onClick={() => setTab('classes')}>Classes tab</button>{' '}
                  to generate a shareable join link.
                </span>
              </div>
            </div>

            <div className="pa-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="pa-section-title">Members ({members.length})</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="pa-btn pa-btn--ghost od-import-btn" onClick={() => { setImportModal(true); setImportResults(null); setImportRows([]); setImportErr('') }}>
                    Import staff CSV
                  </button>
                  <button className="pa-btn pa-btn--ghost od-import-btn" onClick={() => { setParentImportModal(true); setParentImportResults(null); setParentImportRows([]); setParentImportErr('') }}>
                    Import parents CSV
                  </button>
                </div>
              </div>
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
                            <>
                              <button
                                className="od-copy-btn od-copy-btn--generate"
                                disabled={joinBusy[cls.class_id]}
                                onClick={() => generateJoinCode(cls)}
                              >
                                {joinBusy[cls.class_id] ? 'Generating...' : 'Generate'}
                              </button>
                              {joinErr[cls.class_id] && <div className="pa-error" style={{ marginTop: 4, fontSize: 11 }}>{joinErr[cls.class_id]}</div>}
                            </>
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

      {isDirty && (
        <div className="od-save-bar">
          <span className="od-save-bar-msg">You have unsaved changes</span>
          <div className="od-save-bar-actions">
            <button className="pa-btn pa-btn--ghost od-save-bar-discard" onClick={() => { setConfirmLeave(true) }}>Discard</button>
            <button className="pa-btn" onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {confirmLeave && (
        <ConfirmModal
          title="Unsaved changes"
          body="You have unsaved changes to this org. Leave without saving?"
          confirmLabel="Leave"
          onConfirm={() => navigate('/platform')}
          onCancel={() => setConfirmLeave(false)}
        />
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Remove member"
          body={`Remove ${confirmRemove.username} from this org? They will lose access immediately.`}
          confirmLabel="Remove"
          danger
          onConfirm={doRemoveMember}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${orgName}"?`}
          body={`This will permanently delete the organization and disconnect all ${members.length} member${members.length !== 1 ? 's' : ''}. This cannot be undone.`}
          confirmLabel="Delete organization"
          danger
          busy={deleting}
          onConfirm={deleteOrg}
          onCancel={() => { setConfirmDelete(false); setDeleteErr('') }}
        />
      )}

      {importModal && (
        <ImportModal
          orgName={orgName}
          importRole={importRole}
          setImportRole={setImportRole}
          importRows={importRows}
          setImportRows={setImportRows}
          importBusy={importBusy}
          importResults={importResults}
          importErr={importErr}
          parseImportCSV={parseImportCSV}
          onSubmit={submitImport}
          onClose={closeImportModal}
        />
      )}

      {parentImportModal && (
        <ParentImportModal
          orgName={orgName}
          rows={parentImportRows}
          setRows={setParentImportRows}
          busy={parentImportBusy}
          results={parentImportResults}
          err={parentImportErr}
          parseCSV={parseParentCSV}
          onSubmit={submitParentImport}
          onClose={closeParentImportModal}
        />
      )}
    </div>
  )
}
