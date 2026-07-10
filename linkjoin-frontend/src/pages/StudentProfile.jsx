import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api/client.js'
import { usersApi } from '../api/users.js'
import { getMyRewards } from '../api/rewards.js'
import HeaderModern from '../components/HeaderModern.jsx'
import '../styles/settings.css'

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
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      const s = Math.min(img.width, img.height)
      const ox = (img.width - s) / 2, oy = (img.height - s) / 2
      ctx.drawImage(img, ox, oy, s, s, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = url
  })
}

const AWARD_META = {
  first_steps:      { label: 'First Steps',     color: '#6B7280', desc: 'Attended your first class',        icon: '/images/awards/sprout.svg' },
  on_point:         { label: 'On Point',         color: '#2B8FD8', desc: 'Joined a class on time',          icon: '/images/awards/target.svg' },
  perfect_week:     { label: 'Perfect Week',     color: '#D97706', desc: 'On time every day for a week',    icon: '/images/awards/calendar-check.svg' },
  streak_5:         { label: '5-Day Streak',     color: '#7C3AED', desc: '5 consecutive on-time days',      icon: '/images/awards/flame.svg' },
  streak_10:        { label: '10-Day Streak',    color: '#059669', desc: '10 consecutive on-time days',     icon: '/images/awards/zap.svg' },
  monthly_champion: { label: 'Monthly Champion', color: '#DC2626', desc: '20 consecutive on-time days',     icon: '/images/awards/crown.svg' },
}
const ALL_AWARDS = ['first_steps', 'on_point', 'perfect_week', 'streak_5', 'streak_10', 'monthly_champion']

export default function StudentProfile() {
  const { email: authEmail, role } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [user, setUser] = useState(null)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [saving, setSaving] = useState({})
  const [toast, setToast] = useState(null)

  const [rewards, setRewards] = useState(null)

  useEffect(() => {
    if (role !== 'student') navigate('/settings', { replace: true })
  }, [role, navigate])

  useEffect(() => {
    usersApi.me().then(u => {
      setUser(u)
      setName(u.name || '')
      setAvatar(u.avatar || '')
    }).catch(() => {})

    getMyRewards().then(setRewards).catch(() => {})
  }, [])

  function flash(ok = true) {
    setToast(ok ? 'saved' : 'error')
    setTimeout(() => setToast(null), 1800)
  }

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

  async function saveName() {
    setSaving(s => ({ ...s, name: true }))
    try {
      await apiFetch('/users/name', { method: 'PATCH', body: JSON.stringify({ name }) })
      flash()
    } catch { flash(false) }
    finally { setSaving(s => ({ ...s, name: false })) }
  }

  const displayAvatar = avatarPreview || avatar
  const seed = user?.username || authEmail || '?'
  const pal = avatarPalette(seed)
  const initials = user
    ? (user.name?.trim()?.[0] || user.username?.[0] || '?').toUpperCase()
    : null

  const earned = new Set(rewards?.awards || [])
  const pct = rewards ? Math.round((rewards.on_time_sessions / Math.max(rewards.total_sessions, 1)) * 100) : null

  return (
    <div className="settings-root">
      <HeaderModern page="profile" />

      {toast && (
        <div className={`settings-toast ${toast}`}>
          {toast === 'saved' ? '✓ Saved' : '✕ Failed to save'}
        </div>
      )}

      <div className="settings-page">
        <div className="settings-content">

          <div className="settings-group-label">Profile</div>

          {/* AVATAR + NAME */}
          <section className="settings-section">
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
          </section>

          {/* REWARDS */}
          <section className="settings-section">
            <div className="settings-section-title">Rewards</div>

            {rewards && (
              <div className="sp-stats-row">
                <div className="sp-stat-cell sp-stat-cell--accent">
                  <div className="sp-stat-num">{rewards.current_streak}</div>
                  <div className="sp-stat-lbl">day streak</div>
                </div>
                <div className="sp-stat-cell">
                  <div className="sp-stat-num">{rewards.on_time_sessions}</div>
                  <div className="sp-stat-lbl">on time</div>
                </div>
                <div className="sp-stat-cell">
                  <div className="sp-stat-num">{pct}%</div>
                  <div className="sp-stat-lbl">on-time rate</div>
                </div>
                <div className="sp-stat-cell">
                  <div className="sp-stat-num">{rewards.longest_streak}</div>
                  <div className="sp-stat-lbl">best streak</div>
                </div>
              </div>
            )}

            <div className="sp-awards-list">
              {ALL_AWARDS.map(key => {
                const meta = AWARD_META[key]
                const unlocked = earned.has(key)
                return (
                  <div key={key} className={`sp-award-row${unlocked ? ' sp-award-row--earned' : ' sp-award-row--locked'}`}>
                    <div
                      className="sp-award-icon"
                      style={unlocked ? { background: meta.color } : undefined}
                    >
                      <img src={meta.icon} alt="" className="sp-award-icon-img" />
                    </div>
                    <div>
                      <div className="sp-award-name">{meta.label}</div>
                      <div className="sp-award-desc">{meta.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
