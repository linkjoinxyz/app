import { useState, useEffect } from 'react'
import { useModalClose } from '../hooks/useModalClose.js'
import { apiFetch } from '../api/client.js'
import { usersApi } from '../api/users.js'
import { useAuth } from '../context/AuthContext.jsx'
import countryCodes from '../../public/country_codes.json'
import '../styles/modal.css'

const OPEN_EARLY_OPTIONS = [0, 1, 2, 3, 5, 10, 15]
const SORT_OPTIONS = ['None', 'Day & Time', 'Upcoming']

export default function SettingsModal({ user, visible, onClose, onShowDeleted, onCalendarImport, onOutlookImport, onUserRefresh }) {
  const { closing, handleClose } = useModalClose(onClose)
  const { logout } = useAuth()
  const [tab, setTab] = useState('personal')
  const [sort, setSort] = useState(user?.sort || 'None')
  const [openEarly, setOpenEarly] = useState(user?.open_early || 0)
  const [number, setNumber] = useState(user?.number || '')
  const [countryCode, setCountryCode] = useState('1')
  const [adminView, setAdminView] = useState(user?.admin_view === 'true')
  const [orgDisabled, setOrgDisabled] = useState(user?.org_disabled === 'true')
  const [autoDelete, setAutoDelete] = useState(!!user?.auto_delete_past)
  const [vacationMode, setVacationMode] = useState(!!user?.vacation_mode)
  const [showCalendar, setShowCalendar] = useState(!!user?.show_calendar)
  const [resetSent, setResetSent] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  function flashSaved(ok = true) {
    setSaveStatus(ok ? 'saved' : 'error')
    setTimeout(() => setSaveStatus(null), 1500)
  }

  useEffect(() => {
    if (user) {
      setSort(user.sort || 'None')
      setOpenEarly(user.open_early || 0)
      setNumber(user.number || '')
      setAdminView(user.admin_view === 'true')
      setOrgDisabled(user.org_disabled === 'true')
      setAutoDelete(!!user.auto_delete_past)
      setVacationMode(!!user.vacation_mode)
      setShowCalendar(!!user.show_calendar)
    }
  }, [user])

  if (!visible) return null

  async function saveSort(v) {
    setSort(v)
    await usersApi.setSort(v).then(() => flashSaved()).catch(() => flashSaved(false))
  }

  async function saveOpenEarly(v) {
    setOpenEarly(v)
    await usersApi.setOpenEarly(Number(v)).then(() => flashSaved()).catch(() => flashSaved(false))
  }

  async function saveNumber() {
    await usersApi.addNumber(String(number), countryCode).then(() => { flashSaved(); onUserRefresh?.() }).catch(() => flashSaved(false))
  }

  async function sendPasswordReset() {
    const email = user?.username
    if (!email) return
    await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }).catch(() => {})
    setResetSent(true)
  }

  return (
    <div className={`modal-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <img
          src="/images/arrow-left.svg"
          className="modal-back"
          alt="back"
          onClick={confirmDelete ? () => { setConfirmDelete(false); setDeleteError('') } : resetSent ? () => setResetSent(false) : handleClose}
        />
        {confirmDelete ? (
          <div className="modal-delete-confirm">
            <div className="modal-delete-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="modal-delete-title">Delete your account?</h2>
            <p className="modal-delete-body">
              This will permanently delete your account, all your meetings, bookmarks, and settings.
              <strong> This cannot be undone.</strong>
            </p>
            {deleteError && <div className="modal-error" style={{ marginBottom: 12 }}>{deleteError}</div>}
            <button className="modal-cancel-btn" onClick={() => { setConfirmDelete(false); setDeleteError('') }}>
              Cancel
            </button>
            <button
              className={`modal-danger-btn modal-danger-btn-full${deleting ? ' disabled' : ''}`}
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
        ) : resetSent ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0 8px' }}>
            <div style={{ fontSize: 40 }}>📧</div>
            <div style={{ font: '600 20px Montserrat', color: 'white' }}>Check your inbox</div>
            <div style={{ font: '400 14px Montserrat', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
              A password reset link has been sent to<br /><span style={{ color: 'var(--lightblue)' }}>{user?.username}</span>
            </div>
            <button className="modal-submit" onClick={handleClose} style={{ marginTop: 16 }}>Done</button>
          </div>
        ) : <>
        <div className="modal-title">Settings</div>
        {saveStatus && (
          <div className={`settings-save-toast ${saveStatus}`}>
            {saveStatus === 'saved'
              ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Saved</>
              : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg> Failed to save</>
            }
          </div>
        )}

        {user?.admin === 'true' && (
          <div className="modal-settings-tabs">
            <div
              className={`modal-settings-tab${tab === 'personal' ? ' active' : ''}`}
              onClick={() => setTab('personal')}
            >Personal</div>
            <div
              className={`modal-settings-tab${tab === 'admin' ? ' active' : ''}`}
              onClick={() => setTab('admin')}
            >Admin</div>
          </div>
        )}

        {tab === 'personal' && (
          <>

            <div className="modal-settings-row">
              <div className="modal-settings-name">Sort Links</div>
              <select className="modal-select" value={sort} onChange={e => saveSort(e.target.value)}>
                {SORT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div className="modal-settings-row">
              <div className="modal-settings-name">Open Early</div>
              <select className="modal-select" value={openEarly} onChange={e => saveOpenEarly(e.target.value)}>
                {OPEN_EARLY_OPTIONS.map(o => <option key={o} value={o}>{o} min</option>)}
              </select>
            </div>

            <div className="modal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              <div className="modal-settings-name">Phone Number</div>
              <div className="modal-phone-row" style={{ width: '100%' }}>
                <select
                  className="modal-country-select"
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                >
                  {Object.entries(countryCodes).map(([c, v]) => (
                    <option key={c} value={v}>{c} +{v}</option>
                  ))}
                </select>
                <input
                  className="modal-phone-input"
                  placeholder="Phone number"
                  value={String(number || '')}
                  onChange={e => setNumber(e.target.value)}
                />
                <button className="modal-action-btn" onClick={saveNumber}>Save</button>
              </div>
            </div>

            <div className="modal-settings-row">
              <div>
                <div className="modal-settings-name">Vacation Mode</div>
                <div className="modal-settings-desc">Temporarily pause all auto-opens</div>
              </div>
              <input
                type="checkbox"
                className="modal-checkbox"
                checked={vacationMode}
                onChange={async e => {
                  setVacationMode(e.target.checked)
                  await usersApi.setVacationMode(e.target.checked).then(() => flashSaved()).catch(() => flashSaved(false))
                }}
              />
            </div>

            <div className="modal-settings-row">
              <div>
                <div className="modal-settings-name">Show Calendar</div>
                <div className="modal-settings-desc">Split view with a monthly calendar alongside your meetings</div>
              </div>
              <input
                type="checkbox"
                className="modal-checkbox"
                checked={showCalendar}
                onChange={async e => {
                  setShowCalendar(e.target.checked)
                  await usersApi.setShowCalendar(e.target.checked).then(() => flashSaved()).catch(() => flashSaved(false))
                }}
              />
            </div>

            <div className="modal-settings-row">
              <div>
                <div className="modal-settings-name">Auto-Delete Past Meetings</div>
                <div className="modal-settings-desc">Automatically remove one-off meetings after they occur</div>
              </div>
              <input
                type="checkbox"
                className="modal-checkbox"
                checked={autoDelete}
                onChange={async e => {
                  setAutoDelete(e.target.checked)
                  await usersApi.setAutoDelete(e.target.checked).then(() => flashSaved()).catch(() => flashSaved(false))
                }}
              />
            </div>

            <div className="modal-settings-row">
              <div className="modal-settings-name">Deleted Links</div>
              <button className="modal-action-btn" onClick={() => { handleClose(); onShowDeleted() }}>View</button>
            </div>

            <div className="modal-settings-row">
              <div>
                <div className="modal-settings-name">Google Calendar</div>
                <div className="modal-settings-desc">Import recurring meetings from Google Calendar</div>
              </div>
              <button className="modal-action-btn" onClick={() => { handleClose(); onCalendarImport?.() }}>Import</button>
            </div>

            <div className="modal-settings-row">
              <div>
                <div className="modal-settings-name">Outlook Calendar</div>
                <div className="modal-settings-desc">Import recurring meetings from Outlook</div>
              </div>
              <button className="modal-action-btn" onClick={() => { handleClose(); onOutlookImport?.() }}>Import</button>
            </div>

            <div className="modal-settings-row" style={{ borderBottom: 'none' }}>
              <div className="modal-settings-name">Password</div>
              <button className="modal-action-btn" onClick={sendPasswordReset}>Reset</button>
            </div>

            <div className="modal-settings-danger-zone">
              <button className="modal-danger-btn" onClick={() => setConfirmDelete(true)}>
                Delete Account
              </button>
            </div>
          </>
        )}

        {tab === 'admin' && user?.admin === 'true' && (
          <>
            <div className="modal-settings-row">
              <div>
                <div className="modal-settings-name">Disable All</div>
                <div className="modal-settings-desc">Disable all links in your organization</div>
              </div>
              <input
                type="checkbox"
                className="modal-checkbox"
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

            <div className="modal-settings-row">
              <div>
                <div className="modal-settings-name">Admin View</div>
                <div className="modal-settings-desc">View all links in your organization</div>
              </div>
              <input
                type="checkbox"
                className="modal-checkbox"
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
          </>
        )}
        </>}
      </div>
    </div>
  )
}
