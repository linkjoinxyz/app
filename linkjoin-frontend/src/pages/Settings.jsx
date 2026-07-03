import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch, apiGet, apiPost, apiDelete, apiPatch } from '../api/client.js'
import { usersApi } from '../api/users.js'
import HeaderModern from '../components/HeaderModern.jsx'
import countryCodes from '../../public/country_codes.json'
import '../styles/settings.css'
import '../styles/admin.css'

const OPEN_EARLY_OPTIONS = [0, 1, 2, 3, 5, 10, 15]
const SORT_OPTIONS = ['None', 'Day & Time', 'Upcoming']

const AVATAR_PALETTES = [
  { bg: 'rgba(43,143,216,0.35)',  border: 'rgba(43,143,216,0.6)' },
  { bg: 'rgba(72,197,120,0.3)',   border: 'rgba(72,197,120,0.55)' },
  { bg: 'rgba(255,160,50,0.3)',   border: 'rgba(255,160,50,0.55)' },
  { bg: 'rgba(180,100,220,0.3)',  border: 'rgba(180,100,220,0.55)' },
  { bg: 'rgba(50,180,180,0.3)',   border: 'rgba(50,180,180,0.55)' },
]
function avatarPalette(seed) {
  return AVATAR_PALETTES[(seed || '?').charCodeAt(0) % AVATAR_PALETTES.length]
}

async function resizeToDataURL(file, size = 220) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      const dim = Math.min(img.width, img.height)
      const ox = (img.width - dim) / 2
      const oy = (img.height - dim) / 2
      ctx.drawImage(img, ox, oy, dim, dim, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')) }
    img.src = url
  })
}

// ─── Org Settings Cards ───────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  tardy_threshold_minutes: 5,
  tardy_rate_flag: 33,
  attendance_rate_flag: 50,
  min_sessions_to_flag: 3,
}

function AlertSettingsCard({ orgId }) {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(DEFAULT_THRESHOLDS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!orgId) return
    apiGet(`/orgs/${orgId}/attendance-settings`).then(s => {
      const normalized = {
        tardy_threshold_minutes: s.tardy_threshold_minutes,
        tardy_rate_flag: Math.round(s.tardy_rate_flag * 100),
        attendance_rate_flag: Math.round(s.attendance_rate_flag * 100),
        min_sessions_to_flag: s.min_sessions_to_flag,
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
    if (tardyMin < 0 || tardyMin > 60) return setSaveError('Minutes late must be between 0 and 60.')
    if (tardyRate < 1 || tardyRate > 100) return setSaveError('Tardy rate must be between 1% and 100%.')
    if (attRate < 1 || attRate > 100) return setSaveError('Attendance rate must be between 1% and 100%.')
    if (minSess < 1 || minSess > 20) return setSaveError('Minimum sessions must be between 1 and 20.')
    setSaving(true)
    setSaveError(null)
    try {
      await apiPatch(`/orgs/${orgId}/attendance-settings`, {
        tardy_threshold_minutes: tardyMin,
        tardy_rate_flag: tardyRate / 100,
        attendance_rate_flag: attRate / 100,
        min_sessions_to_flag: minSess,
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
    draft.min_sessions_to_flag !== settings.min_sessions_to_flag
  )

  return (
    <div className="alert-settings-card">
      <button className="alert-settings-toggle" onClick={() => setOpen(o => !o)}>
        <span>Alert Settings</span>
        <span className="alert-settings-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
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
          </div>
          <div className="alert-settings-footer">
            {saveError && <span className="alert-settings-error">{saveError}</span>}
            {saved && !dirty && !saveError && <span className="alert-settings-saved">Saved</span>}
            <button className="admin-btn" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AcademicCalendarCard({ orgId }) {
  const [dates, setDates] = useState([])
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!orgId || !open) return
    apiGet(`/orgs/${orgId}/calendar`).then(r => setDates(r.blackout_dates || [])).catch(() => {})
  }, [orgId, open])

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
      <button className="alert-settings-toggle" onClick={() => setOpen(o => !o)}>
        <span>Academic Calendar</span>
        {dates.length > 0 && <span className="cal-badge">{dates.length} day{dates.length !== 1 ? 's' : ''} off</span>}
        <span className="alert-settings-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="alert-settings-body">
          <div className="cal-desc">
            Mark school holidays and snow days. These dates are excluded from expected attendance counts so absent students aren't flagged for days school wasn't in session.
          </div>
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
      )}
    </div>
  )
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const { email: authEmail, logout, role, orgId } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [user, setUser] = useState(null)
  const [toast, setToast] = useState(null)

  // Profile fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('1')
  const [avatar, setAvatar] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')

  // Parent contact
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentPhoneCountry, setParentPhoneCountry] = useState('1')
  const [parentEmail, setParentEmail] = useState('')

  // Preferences
  const [sort, setSort] = useState('None')
  const [openEarly, setOpenEarly] = useState(0)
  const [vacationMode, setVacationMode] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [autoDelete, setAutoDelete] = useState(false)

  // Admin
  const [adminView, setAdminView] = useState(false)
  const [orgDisabled, setOrgDisabled] = useState(false)

  // Save states
  const [saving, setSaving] = useState({})
  const [resetSent, setResetSent] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    usersApi.me().then(u => {
      setUser(u)
      setName(u.name || '')
      setPhone(u.number ? String(u.number).slice(-10) : '')
      setCountryCode(u.countrycode || '1')
      setAvatar(u.avatar || '')
      setSort(u.sort || 'None')
      setOpenEarly(u.open_early || 0)
      setVacationMode(!!u.vacation_mode)
      setShowCalendar(!!u.show_calendar)
      setAutoDelete(!!u.auto_delete_past)
      setAdminView(u.admin_view === 'true')
      setOrgDisabled(u.org_disabled === 'true')
      setParentName(u.parent_name || '')
      setParentPhone(u.parent_phone || '')
      setParentPhoneCountry(u.parent_phone_country || '1')
      setParentEmail(u.parent_email || '')
    }).catch(() => {})
  }, [])

  function flash(ok = true) {
    setToast(ok ? 'saved' : 'error')
    setTimeout(() => setToast(null), 1800)
  }

  // --- Avatar ---
  async function handleAvatarFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await resizeToDataURL(file)
      setAvatarPreview(dataUrl)
      setSaving(s => ({ ...s, avatar: true }))
      await apiFetch('/users/avatar', { method: 'PATCH', body: JSON.stringify({ avatar: dataUrl }) })
      setAvatar(dataUrl)
      flash()
    } catch { flash(false) }
    finally { setSaving(s => ({ ...s, avatar: false })) }
    e.target.value = ''
  }

  async function removeAvatar() {
    setSaving(s => ({ ...s, avatar: true }))
    try {
      await apiFetch('/users/avatar', { method: 'PATCH', body: JSON.stringify({ avatar: '' }) })
      setAvatar('')
      setAvatarPreview('')
      flash()
    } catch { flash(false) }
    finally { setSaving(s => ({ ...s, avatar: false })) }
  }

  // --- Name ---
  async function saveName() {
    setSaving(s => ({ ...s, name: true }))
    try {
      await apiFetch('/users/name', { method: 'PATCH', body: JSON.stringify({ name }) })
      flash()
    } catch { flash(false) }
    finally { setSaving(s => ({ ...s, name: false })) }
  }

  // --- Phone ---
  async function savePhone() {
    setSaving(s => ({ ...s, phone: true }))
    try {
      await usersApi.addNumber(phone, countryCode)
      flash()
    } catch { flash(false) }
    finally { setSaving(s => ({ ...s, phone: false })) }
  }

  // --- Parent contact ---
  async function saveParentContact() {
    setSaving(s => ({ ...s, parent: true }))
    try {
      await apiFetch('/users/parent-contact', { method: 'PATCH', body: JSON.stringify({
        parent_name: parentName,
        parent_phone: parentPhone,
        parent_phone_country: parentPhoneCountry,
        parent_email: parentEmail,
      }) })
      flash()
    } catch { flash(false) }
    finally { setSaving(s => ({ ...s, parent: false })) }
  }

  // --- Preferences ---
  async function saveSort(v) {
    setSort(v)
    await usersApi.setSort(v).then(() => flash()).catch(() => flash(false))
  }

  async function saveOpenEarly(v) {
    setOpenEarly(v)
    await usersApi.setOpenEarly(Number(v)).then(() => flash()).catch(() => flash(false))
  }

  async function toggleVacation(checked) {
    setVacationMode(checked)
    await usersApi.setVacationMode(checked).then(() => flash()).catch(() => flash(false))
  }

  async function toggleShowCalendar(checked) {
    setShowCalendar(checked)
    await usersApi.setShowCalendar(checked).then(() => flash()).catch(() => flash(false))
  }

  async function toggleAutoDelete(checked) {
    setAutoDelete(checked)
    await usersApi.setAutoDelete(checked).then(() => flash()).catch(() => flash(false))
  }

  // --- Password ---
  async function sendPasswordReset() {
    const email = user?.username
    if (!email) return
    await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }).catch(() => {})
    setResetSent(true)
  }

  const displayAvatar = avatarPreview || avatar
  const seed = user?.username || authEmail || '?'
  const pal = avatarPalette(seed)
  const initials = user
    ? (user.name?.trim()?.[0] || user.username?.[0] || '?').toUpperCase()
    : null

  return (
    <div className="settings-root">
      <HeaderModern page="settings" />

      {toast && (
        <div className={`settings-toast ${toast}`}>
          {toast === 'saved' ? '✓ Saved' : '✕ Failed to save'}
        </div>
      )}

      <div className="settings-page">
        <div className="settings-content">

          <div className="settings-group-label">Personal Settings</div>

          {/* PROFILE — students have a dedicated /profile page */}
          {role !== 'student' && <section className="settings-section">
            <div className="settings-section-title">Profile</div>

            <div className="settings-avatar-row">
              <div
                className="settings-avatar-wrap"
                onClick={() => !saving.avatar && fileRef.current?.click()}
                style={!displayAvatar ? { background: pal.bg, border: `2px solid ${pal.border}` } : {}}
              >
                {displayAvatar
                  ? <img src={displayAvatar} alt="Profile" className="settings-avatar-img" />
                  : initials && <span className="settings-avatar-initials">{initials}</span>
                }
                <div className="settings-avatar-overlay" />
              </div>
              <div className="settings-avatar-info">
                <div className="settings-avatar-email">{user?.username || authEmail}</div>
                <div className="settings-avatar-btns">
                  <button
                    className="settings-btn-subtle"
                    onClick={() => fileRef.current?.click()}
                    disabled={saving.avatar}
                  >
                    {saving.avatar ? 'Uploading…' : 'Change photo'}
                  </button>
                  {displayAvatar && (
                    <button className="settings-btn-danger-text" onClick={removeAvatar} disabled={saving.avatar}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
            </div>

            <div className="settings-field">
              <label className="settings-label">Display Name</label>
              <div className="settings-field-row">
                <input
                  className="settings-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  placeholder="Your full name"
                  maxLength={100}
                />
                <button className="settings-save-btn" onClick={saveName} disabled={saving.name}>
                  {saving.name ? '…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-label">Phone Number</label>
              <div className="settings-field-row">
                <select
                  className="settings-select settings-country-select"
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                >
                  {Object.entries(countryCodes).map(([c, v]) => (
                    <option key={c} value={v}>{c} +{v}</option>
                  ))}
                </select>
                <input
                  className="settings-input"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && savePhone()}
                  placeholder="Phone number"
                  maxLength={15}
                  inputMode="tel"
                />
                <button className="settings-save-btn" onClick={savePhone} disabled={saving.phone || !phone}>
                  {saving.phone ? '…' : 'Save'}
                </button>
              </div>
            </div>

            {user?.role === 'student' && (
              <div className="settings-field">
                <label className="settings-label">Parent / Guardian Contact</label>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                  Used to notify your parent or guardian if you miss a class.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className="settings-input" placeholder="Parent name (e.g. Mrs. Johnson)"
                    value={parentName} onChange={e => setParentName(e.target.value)} />
                  <div className="settings-field-row">
                    <select className="settings-select settings-country-select"
                      value={parentPhoneCountry} onChange={e => setParentPhoneCountry(e.target.value)}>
                      {Object.entries(countryCodes).map(([c, v]) => (
                        <option key={c} value={v}>{c} +{v}</option>
                      ))}
                    </select>
                    <input className="settings-input" placeholder="Parent phone"
                      value={parentPhone} onChange={e => setParentPhone(e.target.value.replace(/\D/g, ''))}
                      inputMode="tel" />
                  </div>
                  <div className="settings-field-row">
                    <input className="settings-input" placeholder="Parent email" type="email"
                      value={parentEmail} onChange={e => setParentEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveParentContact()} />
                    <button className="settings-save-btn" onClick={saveParentContact} disabled={saving.parent}>
                      {saving.parent ? '…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>}

          {/* PREFERENCES */}
          <section className="settings-section">
            <div className="settings-section-title">Preferences</div>

            <div className="settings-row">
              <div className="settings-row-label">Sort Links</div>
              <select className="settings-select" value={sort} onChange={e => saveSort(e.target.value)}>
                {SORT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">Open Early</div>
              <select className="settings-select" value={openEarly} onChange={e => saveOpenEarly(e.target.value)}>
                {OPEN_EARLY_OPTIONS.map(o => <option key={o} value={o}>{o} min</option>)}
              </select>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-row-label">Vacation Mode</div>
                <div className="settings-row-desc">Temporarily pause all auto-opens</div>
              </div>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={vacationMode}
                onChange={e => toggleVacation(e.target.checked)}
              />
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-row-label">Show Calendar</div>
                <div className="settings-row-desc">Split view with a monthly calendar alongside your meetings</div>
              </div>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={showCalendar}
                onChange={e => toggleShowCalendar(e.target.checked)}
              />
            </div>

            <div className="settings-row settings-row--last">
              <div>
                <div className="settings-row-label">Auto-Delete Past Meetings</div>
                <div className="settings-row-desc">Automatically remove one-off meetings after they occur</div>
              </div>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={autoDelete}
                onChange={e => toggleAutoDelete(e.target.checked)}
              />
            </div>
          </section>

          {/* INTEGRATIONS (not shown to students — their links come from teachers) */}
          {role !== 'student' && <section className="settings-section">
            <div className="settings-section-title">Integrations</div>

            <div className="settings-row">
              <div>
                <div className="settings-row-label">Google Calendar</div>
                <div className="settings-row-desc">Import recurring meetings from Google Calendar</div>
              </div>
              <button className="settings-btn" onClick={() => navigate('/meetings', { state: { triggerImport: 'google' } })}>
                Import
              </button>
            </div>

            <div className="settings-row settings-row--last">
              <div>
                <div className="settings-row-label">Outlook Calendar</div>
                <div className="settings-row-desc">Import recurring meetings from Outlook</div>
              </div>
              <button className="settings-btn" onClick={() => navigate('/meetings', { state: { triggerImport: 'microsoft' } })}>
                Import
              </button>
            </div>
          </section>}

          {/* ACCOUNT */}
          <section className="settings-section">
            <div className="settings-section-title">Account</div>

            <div className="settings-row">
              <div className="settings-row-label">Email</div>
              <div className="settings-row-value">{user?.username || authEmail}</div>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">Password</div>
              {resetSent
                ? <span className="settings-status-ok">Reset email sent</span>
                : <button className="settings-btn" onClick={sendPasswordReset}>Reset</button>
              }
            </div>

            <div className="settings-row settings-row--last">
              <div className="settings-row-label">Deleted Links</div>
              <button className="settings-btn" onClick={() => navigate('/meetings', { state: { showDeleted: true } })}>
                View
              </button>
            </div>

            {!confirmDelete ? (
              <div className="settings-danger-zone">
                <button className="settings-danger-btn" onClick={() => setConfirmDelete(true)}>
                  Delete Account
                </button>
              </div>
            ) : (
              <div className="settings-delete-confirm">
                <div className="settings-delete-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="settings-delete-msg">
                  This will permanently delete your account, all your meetings, bookmarks, and settings.
                  <strong> This cannot be undone.</strong>
                </div>
                {deleteError && <div className="settings-error">{deleteError}</div>}
                <div className="settings-delete-actions">
                  <button className="settings-btn" onClick={() => { setConfirmDelete(false); setDeleteError('') }}>
                    Cancel
                  </button>
                  <button
                    className={`settings-danger-btn${deleting ? ' disabled' : ''}`}
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true)
                      setDeleteError('')
                      try {
                        await usersApi.deleteAccount()
                        await logout()
                      } catch {
                        setDeleteError('Something went wrong. Please try again.')
                        setDeleting(false)
                      }
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete my account'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SITE ADMIN (site admins only) */}
          {user?.admin === 'true' && (
            <section className="settings-section">
              <div className="settings-section-title">Admin</div>

              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Disable All</div>
                  <div className="settings-row-desc">Disable all links in your organization</div>
                </div>
                <input
                  type="checkbox"
                  className="settings-toggle"
                  checked={orgDisabled}
                  onChange={async e => {
                    setOrgDisabled(e.target.checked)
                    await apiFetch('/admin/disable-all', {
                      method: 'POST',
                      body: JSON.stringify({ disable: e.target.checked }),
                    }).catch(() => {})
                  }}
                />
              </div>

              <div className="settings-row settings-row--last">
                <div>
                  <div className="settings-row-label">Admin View</div>
                  <div className="settings-row-desc">View all links in your organization</div>
                </div>
                <input
                  type="checkbox"
                  className="settings-toggle"
                  checked={adminView}
                  onChange={async e => {
                    setAdminView(e.target.checked)
                    await apiFetch('/admin/view', {
                      method: 'POST',
                      body: JSON.stringify({ admin_view: e.target.checked }),
                    }).catch(() => {})
                  }}
                />
              </div>
            </section>
          )}

          {/* ORGANIZATION SETTINGS (school/district admins) */}
          {(role === 'school_admin' || role === 'district_admin') && orgId && (
            <>
              <div className="settings-group-label" style={{ marginTop: 12 }}>Organization Settings</div>
              <AlertSettingsCard orgId={orgId} />
              <AcademicCalendarCard orgId={orgId} />
            </>
          )}

        </div>
      </div>
    </div>
  )
}
