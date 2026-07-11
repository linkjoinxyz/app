import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api/client.js'
import HeaderModern from '../components/HeaderModern.jsx'
import '../styles/profile.css'

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

export default function Profile() {
  const { email: authEmail } = useAuth()
  const [user, setUser] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('1')
  const [avatar, setAvatar] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [saving, setSaving] = useState({})
  const [status, setStatus] = useState({})
  const fileRef = useRef()

  useEffect(() => {
    apiFetch('/users/me').then(u => {
      setUser(u)
      setName(u.name || '')
      setPhone(u.number ? String(u.number).slice(-10) : '')
      setCountryCode(u.countrycode || '1')
      setAvatar(u.avatar || '')
    }).catch(() => {})
  }, [])

  function flash(key, ok = true) {
    setStatus(s => ({ ...s, [key]: ok ? 'saved' : 'error' }))
    setTimeout(() => setStatus(s => ({ ...s, [key]: null })), 2000)
  }

  async function saveName() {
    setSaving(s => ({ ...s, name: true }))
    try {
      await apiFetch('/users/name', { method: 'PATCH', body: JSON.stringify({ name }) })
      setUser(u => u ? { ...u, name } : u)
      flash('name')
    } catch { flash('name', false) }
    finally { setSaving(s => ({ ...s, name: false })) }
  }

  async function savePhone() {
    setSaving(s => ({ ...s, phone: true }))
    try {
      await apiFetch('/users/number', { method: 'PATCH', body: JSON.stringify({ number: phone, countrycode: countryCode }) })
      flash('phone')
    } catch { flash('phone', false) }
    finally { setSaving(s => ({ ...s, phone: false })) }
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
      flash('avatar')
    } catch { flash('avatar', false) }
    finally { setSaving(s => ({ ...s, avatar: false })) }
    e.target.value = ''
  }

  async function removeAvatar() {
    setSaving(s => ({ ...s, avatar: true }))
    try {
      await apiFetch('/users/avatar', { method: 'PATCH', body: JSON.stringify({ avatar: '' }) })
      setAvatar('')
      setAvatarPreview('')
      flash('avatar')
    } catch { flash('avatar', false) }
    finally { setSaving(s => ({ ...s, avatar: false })) }
  }

  const displayAvatar = avatarPreview || avatar
  const seed = user?.username || authEmail || '?'
  const pal = avatarPalette(seed)
  const initials = user
    ? (user.name?.trim()?.[0] || user.username?.[0] || '?').toUpperCase()
    : null

  return (
    <div className="profile-root">
      <HeaderModern page="profile" />
      <div className="profile-page">
        <div className="profile-card">

          {/* Avatar */}
          <div className="profile-avatar-section">
            <div
              className="profile-avatar-wrap"
              onClick={() => !saving.avatar && fileRef.current?.click()}
              title="Change photo"
              style={!displayAvatar ? { background: pal.bg, border: `2px solid ${pal.border}` } : {}}
            >
              {displayAvatar
                ? <img src={displayAvatar} alt="Profile" className="profile-avatar-img" />
                : initials && <span className="profile-avatar-initials">{initials}</span>
              }
              <div className="profile-avatar-overlay">
                {saving.avatar ? '…' : ''}
              </div>
            </div>
            <div className="profile-avatar-actions">
              <button className="profile-avatar-upload-btn" onClick={() => fileRef.current?.click()} disabled={saving.avatar}>
                {saving.avatar ? 'Uploading…' : 'Change photo'}
              </button>
              {displayAvatar && (
                <button className="profile-avatar-remove-btn" onClick={removeAvatar} disabled={saving.avatar}>
                  Remove
                </button>
              )}
              {status.avatar === 'saved' && <span className="profile-status-ok">Saved</span>}
              {status.avatar === 'error' && <span className="profile-status-err">Failed</span>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarFile}
            />
          </div>

          <div className="profile-email-badge">{user?.username || authEmail}</div>

          {/* Name */}
          <div className="profile-field">
            <label className="profile-label">Display Name</label>
            <div className="profile-field-row">
              <input
                className="profile-input"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                placeholder="Your full name"
                maxLength={100}
              />
              <button className="profile-save-btn" onClick={saveName} disabled={saving.name}>
                {saving.name ? '…' : 'Save'}
              </button>
            </div>
            {status.name === 'saved' && <span className="profile-status-ok">Saved</span>}
            {status.name === 'error' && <span className="profile-status-err">Failed to save</span>}
          </div>

          {/* Phone */}
          <div className="profile-field">
            <label className="profile-label">Phone Number</label>
            <div className="profile-field-row">
              <select
                className="profile-country-select"
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
              >
                <option value="1">+1</option>
                <option value="44">+44</option>
                <option value="61">+61</option>
                <option value="49">+49</option>
                <option value="33">+33</option>
                <option value="81">+81</option>
                <option value="86">+86</option>
                <option value="91">+91</option>
                <option value="55">+55</option>
                <option value="52">+52</option>
              </select>
              <input
                className="profile-input"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && savePhone()}
                placeholder="Phone number"
                maxLength={15}
                inputMode="tel"
              />
              <button className="profile-save-btn" onClick={savePhone} disabled={saving.phone || !phone}>
                {saving.phone ? '…' : 'Save'}
              </button>
            </div>
            {status.phone === 'saved' && <span className="profile-status-ok">Saved</span>}
            {status.phone === 'error' && <span className="profile-status-err">Failed to save</span>}
          </div>

        </div>
      </div>
    </div>
  )
}
