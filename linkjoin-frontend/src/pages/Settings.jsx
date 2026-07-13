import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch, apiGet, apiPost, apiDelete, apiPatch } from '../api/client.js'
import { usersApi } from '../api/users.js'
import { authApi } from '../api/auth.js'
import SideNav from '../components/SideNav.jsx'
import countryCodes from '../../public/country_codes.json'
import '../styles/settings.css'
import '../styles/admin.css'
import '../styles/modal.css'

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

function MfaSection({ user, showToast }) {
  const { mfaEnabled, setMfaEnabled } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [mfaPhone, setMfaPhone] = useState('')
  const [mfaCountry, setMfaCountry] = useState('1')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaStep, setMfaStep] = useState('idle') // idle | sent | disabling
  const [mfaError, setMfaError] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const isEnabled = mfaEnabled

  function fullPhone() { return mfaCountry + mfaPhone.replace(/\D/g, '') }

  async function sendSetupCode() {
    if (!mfaPhone.trim()) { setMfaError('Enter a phone number first.'); return }
    setMfaLoading(true)
    setMfaError('')
    try {
      await usersApi.setupMfa(true, fullPhone())
      setMfaStep('sent')
    } catch (e) {
      setMfaError(e.body?.detail || 'Failed to send code. Check the phone number.')
    } finally {
      setMfaLoading(false)
    }
  }

  async function confirmSetup() {
    if (!mfaCode.trim()) return
    setMfaLoading(true)
    setMfaError('')
    try {
      await usersApi.verifyMfaSetup(mfaCode.trim(), fullPhone())
      setMfaEnabled(true)
      showToast(true)
      setMfaStep('idle')
      setExpanded(false)
      setMfaCode('')
      setMfaPhone('')
    } catch (e) {
      setMfaError(e.body?.detail || 'Invalid code. Please try again.')
    } finally {
      setMfaLoading(false)
    }
  }

  async function disableMfa() {
    setMfaLoading(true)
    setMfaError('')
    try {
      await usersApi.setupMfa(false, null)
      setMfaEnabled(false)
      showToast(true)
      setMfaStep('idle')
      setExpanded(false)
    } catch (e) {
      setMfaError(e.body?.detail || 'Failed to disable MFA.')
    } finally {
      setMfaLoading(false)
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-title">Security</div>
      <div className="settings-row settings-row--last">
        <div>
          <div className="settings-row-label">Two-factor authentication</div>
          <div className="settings-row-desc">
            {isEnabled
              ? `Enabled - codes sent via SMS`
              : 'Add an extra layer of security to your account'}
          </div>
        </div>
        <button className="settings-btn" onClick={() => { setExpanded(e => !e); setMfaStep('idle'); setMfaError('') }}>
          {isEnabled ? 'Manage' : 'Enable'}
        </button>
      </div>

      {expanded && !isEnabled && (
        <div className="settings-mfa-setup">
          {mfaError && <div className="settings-error">{mfaError}</div>}
          {mfaStep === 'idle' && (
            <>
              <div className="settings-row-desc" style={{ marginBottom: 10 }}>Enter your phone number to receive verification codes.</div>
              <div className="modal-phone-row">
                <select className="modal-country-select" value={mfaCountry} onChange={e => setMfaCountry(e.target.value)}>
                  {Object.entries(countryCodes).map(([c, v]) => (
                    <option key={c} value={v}>{c} +{v}</option>
                  ))}
                </select>
                <input
                  className="modal-phone-input"
                  type="tel"
                  placeholder="555 000 0000"
                  value={mfaPhone}
                  onChange={e => setMfaPhone(e.target.value)}
                />
              </div>
              <button className="settings-save-btn" onClick={sendSetupCode} disabled={mfaLoading}>
                {mfaLoading ? 'Sending...' : 'Send verification code'}
              </button>
            </>
          )}
          {mfaStep === 'sent' && (
            <>
              <div className="settings-row-desc" style={{ marginBottom: 10 }}>Enter the 6-digit code sent to your phone.</div>
              <input
                className="settings-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && confirmSetup()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="settings-save-btn" onClick={confirmSetup} disabled={mfaLoading || mfaCode.length < 6}>
                  {mfaLoading ? 'Verifying...' : 'Enable MFA'}
                </button>
                <button className="settings-btn" onClick={() => { setMfaStep('idle'); setMfaCode('') }}>Back</button>
              </div>
            </>
          )}
        </div>
      )}

      {expanded && isEnabled && (
        <div className="settings-mfa-setup">
          {mfaError && <div className="settings-error">{mfaError}</div>}
          <div className="settings-row-desc" style={{ marginBottom: 10 }}>MFA is currently active. Disabling it will remove the SMS verification step on login.</div>
          <button className="settings-danger-btn" onClick={disableMfa} disabled={mfaLoading}>
            {mfaLoading ? 'Disabling...' : 'Disable MFA'}
          </button>
        </div>
      )}
    </section>
  )
}

export default function Settings() {
  const { email: authEmail, logout, role, orgId } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [user, setUser] = useState(null)
  const [toast, setToast] = useState(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedLinks, setDeletedLinks] = useState([])

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
      <SideNav page="settings" />
      <div className="sn-content">

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

          </section>}

          {role === 'student' && (
            <section className="settings-section">
              <div className="settings-section-title">Parent / Guardian Contact</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                Used to notify your parent or guardian if you miss a class.
              </div>
              <div className="settings-field">
                <input className="settings-input" placeholder="Parent name (e.g. Mrs. Johnson)"
                  value={parentName} onChange={e => setParentName(e.target.value)} />
              </div>
              <div className="settings-field">
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
              </div>
              <div className="settings-field">
                <div className="settings-field-row">
                  <input className="settings-input" placeholder="Parent email" type="email"
                    value={parentEmail} onChange={e => setParentEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveParentContact()} />
                  <button className="settings-save-btn" onClick={saveParentContact} disabled={saving.parent}>
                    {saving.parent ? '…' : 'Save'}
                  </button>
                </div>
              </div>
            </section>
          )}

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

          {/* SECURITY */}
          <MfaSection user={user} showToast={flash} />

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
              <button className="settings-btn" onClick={async () => {
                const data = await apiGet('/links').catch(() => ({}))
                setDeletedLinks(data['deleted-links'] || [])
                setShowDeleted(true)
              }}>
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


        </div>
      </div>
      </div>

    {showDeleted && (
      <div className="modal-overlay" onClick={() => setShowDeleted(false)}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <img src="/images/arrow-left.svg" className="modal-back" alt="back" onClick={() => setShowDeleted(false)} />
          <div className="modal-title">Deleted Links</div>
          {deletedLinks.length === 0 ? (
            <div className="modal-deleted-empty">
              <div>No deleted links</div>
            </div>
          ) : (
            <div className="modal-deleted-list">
              {deletedLinks.map(l => (
                <div key={l.id} className="modal-deleted-row">
                  <div className="modal-deleted-name">{l.name}</div>
                  <div className="modal-deleted-actions">
                    <button className="modal-action-btn" onClick={async () => {
                      setDeletedLinks(prev => prev.filter(x => x.id !== l.id))
                      await apiPost(`/links/${l.id}/restore?type=link`).catch(() => {
                        setDeletedLinks(prev => [...prev, l])
                      })
                    }}>Restore</button>
                    <button className="modal-action-btn modal-action-btn-danger" onClick={async () => {
                      setDeletedLinks(prev => prev.filter(x => x.id !== l.id))
                      await apiDelete(`/links/${l.id}?permanent=true&type=link`).catch(() => {
                        setDeletedLinks(prev => [...prev, l])
                      })
                    }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  )
}
