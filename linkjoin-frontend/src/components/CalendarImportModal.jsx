import { useState, useEffect, useRef } from 'react'
import { linksApi } from '../api/links.js'
import '../styles/calendar-import.css'

const GOOGLE_CLIENT_ID = '189748485716-d2pih6avqivdondcfjbt0ve8hkj33sts.apps.googleusercontent.com'

// Google token cache (persists across modal opens within the same session)
let cachedGoogleToken = null
let googleTokenExpiry = 0

function clearMsalInteractionLock() {
  for (const key of Object.keys(sessionStorage)) {
    if (/msal.*interaction/i.test(key)) sessionStorage.removeItem(key)
  }
}

async function tryMicrosoftTokenSilent() {
  const { msalInstance, msalReady } = await import('../msalInstance.js')
  try { await msalReady } catch {}
  clearMsalInteractionLock()
  const scopes = ['Calendars.Read']
  const accounts = msalInstance.getAllAccounts()
  if (accounts.length > 0) {
    const result = await msalInstance.acquireTokenSilent({ scopes, account: accounts[0] })
    return result.accessToken
  }
  throw new Error('no_cached_account')
}

async function acquireMicrosoftTokenPopup() {
  const { msalInstance, msalReady } = await import('../msalInstance.js')
  try { await msalReady } catch {}
  clearMsalInteractionLock()
  const result = await msalInstance.acquireTokenPopup({ scopes: ['Calendars.Read'] })
  return result.accessToken
}

// ── Google helpers ──────────────────────────────────────

const BYDAY = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REPEAT_LABEL = {
  week: 'Weekly', month: 'Same date every month', never: 'One time',
  '2 times': 'Every 2 weeks', '3 times': 'Every 3 weeks', '4 times': 'Every 4 weeks',
}

function repeatLabel(r) {
  return REPEAT_LABEL[r] || r
}

function parseRRule(recurrence) {
  if (!recurrence?.length) return null
  const str = recurrence.find(r => r.startsWith('RRULE:'))
  if (!str) return null
  const parts = {}
  str.slice(6).split(';').forEach(p => { const [k, v] = p.split('='); parts[k] = v })
  if (!['WEEKLY', 'MONTHLY'].includes(parts.FREQ)) return null
  const days = parts.BYDAY
    ? parts.BYDAY.split(',').map(d => BYDAY[d.replace(/^[+-]?\d+/, '')]).filter(Boolean)
    : []
  const interval = parseInt(parts.INTERVAL || '1')
  let repeat
  if (parts.FREQ === 'MONTHLY') {
    repeat = 'month'
  } else {
    repeat = { 1: 'week', 2: '2 times', 3: '3 times', 4: '4 times' }[interval] || 'week'
  }
  // For BYMONTHDAY rules, days will be empty here — mapGoogleEvent fills in
  // the weekday from the event's start date, which is the correct reference.
  const finalDays = days
  let endDate = ''
  if (parts.UNTIL) {
    const u = parts.UNTIL
    const end = new Date(`${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`)
    if (end < new Date()) return null
    endDate = `${u.slice(4, 6)}/${u.slice(6, 8)}/${u.slice(0, 4)}`
  }
  return { days: finalDays, repeat, endDate }
}

function extractGoogleLink(event) {
  if (event.hangoutLink) return event.hangoutLink
  const video = event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')
  if (video?.uri) return video.uri
  if (event.description) {
    const m = event.description.match(/https?:\/\/[^\s"<]*(?:zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|meet\.google\.com|gotomeet\.me|bluejeans\.com|whereby\.com)[^\s"<]*/i)
    if (m) return m[0]
  }
  return null
}

function mapGoogleEvent(event) {
  if (event.status === 'cancelled') return null
  if (!event.start?.dateTime) return null
  const link = extractGoogleLink(event)
  if (!link) return null
  const start = new Date(event.start.dateTime)
  const h = start.getHours()
  const m = start.getMinutes()
  const utcM = String(start.getMonth() + 1).padStart(2, '0')
  const utcD = String(start.getDate()).padStart(2, '0')
  const utcY = start.getFullYear()
  const rrule = parseRRule(event.recurrence)
  let days, repeat, endDate
  if (rrule) {
    days = rrule.days.length ? rrule.days : [DOW[start.getDay()]]
    repeat = rrule.repeat
    endDate = rrule.endDate
  } else {
    if (start < new Date()) return null
    days = [DOW[start.getUTCDay()]]
    repeat = 'never'
    endDate = ''
  }
  return {
    id: event.id,
    name: event.summary || 'Untitled Meeting',
    link,
    time: `${h}:${m.toString().padStart(2, '0')}`,
    date: `${utcM}/${utcD}/${utcY}`,
    days,
    repeats: repeat,
    end_date: endDate || undefined,
    text: 'false',
    activated: true,
    displayTime: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    repeatLabel: repeatLabel(repeat),
    platform: detectPlatform(link),
  }
}

// ── Microsoft helpers ───────────────────────────────────

const MS_DAYS = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

function mapMicrosoftRecurrence(recurrence) {
  if (!recurrence) return null
  const { pattern, range } = recurrence
  const days = (pattern.daysOfWeek || []).map(d => MS_DAYS[d]).filter(Boolean)
  let repeat
  if (pattern.type === 'absoluteMonthly') {
    repeat = 'month'
    // days will be empty — mapMicrosoftEvent fills in weekday from start date
  } else if (pattern.type === 'relativeMonthly') {
    repeat = 'month'
  } else if (pattern.type === 'weekly') {
    const iv = pattern.interval || 1
    repeat = { 1: 'week', 2: '2 times', 3: '3 times', 4: '4 times' }[iv] || 'week'
  } else {
    return null
  }
  let endDate = ''
  if (range?.type === 'endDate' && range.endDate) {
    const end = new Date(range.endDate + 'T00:00:00')
    if (end < new Date()) return null
    const [y, mo, d] = range.endDate.split('-')
    endDate = `${mo}/${d}/${y}`
  }
  return { days, repeat, endDate }
}

function extractMicrosoftLink(event) {
  if (event.onlineMeeting?.joinUrl) return event.onlineMeeting.joinUrl
  if (event.onlineMeetingUrl) return event.onlineMeetingUrl
  if (event.body?.content) {
    const text = event.body.content.replace(/<[^>]+>/g, ' ')
    const m = text.match(/https?:\/\/[^\s"'<>]*(?:zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|meet\.google\.com)[^\s"'<>]*/i)
    if (m) return m[0]
  }
  return null
}

function mapMicrosoftEvent(event) {
  const link = extractMicrosoftLink(event)
  if (!link) return null
  const dt = event.start?.dateTime
  if (!dt) return null
  // Graph returns UTC datetime strings without Z when Prefer: outlook.timezone="UTC" is used
  const start = new Date(dt.endsWith('Z') ? dt : dt + 'Z')
  const h = start.getHours()
  const m = start.getMinutes()
  const utcM = String(start.getMonth() + 1).padStart(2, '0')
  const utcD = String(start.getDate()).padStart(2, '0')
  const utcY = start.getFullYear()
  const rec = event.recurrence ? mapMicrosoftRecurrence(event.recurrence) : null
  let days, repeat, endDate
  if (rec) {
    days = rec.days.length ? rec.days : [DOW[start.getDay()]]
    repeat = rec.repeat
    endDate = rec.endDate
  } else {
    if (start < new Date()) return null
    days = [DOW[start.getUTCDay()]]
    repeat = 'never'
    endDate = ''
  }
  return {
    id: event.id,
    name: event.subject || 'Untitled Meeting',
    link,
    time: `${h}:${m.toString().padStart(2, '0')}`,
    date: `${utcM}/${utcD}/${utcY}`,
    days,
    repeats: repeat,
    end_date: endDate || undefined,
    text: 'false',
    activated: true,
    displayTime: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    repeatLabel: repeatLabel(repeat),
    platform: detectPlatform(link),
  }
}

// ── Shared helpers ──────────────────────────────────────

function detectPlatform(url) {
  if (!url) return 'Meeting'
  if (url.includes('zoom.us')) return 'Zoom'
  if (url.includes('meet.google')) return 'Google Meet'
  if (url.includes('teams.microsoft') || url.includes('teams.live')) return 'Teams'
  if (url.includes('webex')) return 'Webex'
  return 'Meeting'
}

function normalizeUrl(url) {
  return (url || '').toLowerCase().replace(/\/+$/, '').trim()
}

// ── Component ───────────────────────────────────────────

export default function CalendarImportModal({ provider = 'google', existingLinks = [], onClose, onImport }) {
  const [status, setStatus] = useState('loading')
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [errorMsg, setErrorMsg] = useState('')
  const googleClientRef = useRef(null)
  const authStarted = useRef(false)

  useEffect(() => {
    if (authStarted.current) return
    authStarted.current = true
    if (provider === 'google') startGoogleAuth()
    else startMicrosoftAuth()
  }, [])

  function startGoogleAuth() {
    if (cachedGoogleToken && Date.now() < googleTokenExpiry) {
      handleGoogleToken({ access_token: cachedGoogleToken })
      return
    }
    function initClient() {
      googleClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: handleGoogleToken,
        error_callback: (err) => {
          if (err.type === 'popup_closed') { onClose(); return }
          setErrorMsg('Authorization failed. Please try again.')
          setStatus('error')
        },
      })
      googleClientRef.current.requestAccessToken()
    }
    if (window.google?.accounts?.oauth2) { initClient(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = initClient
    script.onerror = () => { setErrorMsg('Failed to load Google Sign-In.'); setStatus('error') }
    document.head.appendChild(script)
  }

  async function startMicrosoftAuth() {
    try {
      const token = await tryMicrosoftTokenSilent()
      await handleMicrosoftToken(token)
    } catch {
      // Silent failed — need a popup, which requires a user click
      setStatus('needs-auth')
    }
  }

  async function connectMicrosoft() {
    setStatus('loading')
    try {
      const token = await acquireMicrosoftTokenPopup()
      await handleMicrosoftToken(token)
    } catch (err) {
      const code = err?.errorCode || err?.message || String(err)
      if (/user_cancelled|popup_window_error|empty_window_error/i.test(code)) { onClose(); return }
      setErrorMsg('Authorization failed. Please try again.')
      setStatus('error')
    }
  }

  async function handleGoogleToken(resp) {
    if (resp.error) { setErrorMsg('Authorization failed.'); setStatus('error'); return }
    cachedGoogleToken = resp.access_token
    googleTokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60000
    try {
      const now = new Date()
      const max = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: max.toISOString(),
        singleEvents: 'false',
        maxResults: '250',
        fields: 'items(id,summary,start,recurrence,hangoutLink,conferenceData,description,status)',
      })
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${resp.access_token}` } }
      )
      if (!res.ok) throw new Error()
      const data = await res.json()
      loadEvents((data.items || []).map(mapGoogleEvent))
    } catch {
      setErrorMsg('Failed to load your calendar. Please try again.')
      setStatus('error')
    }
  }

  async function handleMicrosoftToken(token) {
    try {
      const params = new URLSearchParams({
        $top: '250',
        $select: 'id,subject,start,end,recurrence,onlineMeeting,onlineMeetingUrl,body',
      })
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/events?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: 'outlook.timezone="UTC"',
          },
        }
      )
      if (!res.ok) throw new Error()
      const data = await res.json()
      loadEvents((data.value || []).map(mapMicrosoftEvent))
    } catch {
      setErrorMsg('Failed to load your Outlook calendar. Please try again.')
      setStatus('error')
    }
  }

  function loadEvents(mapped) {
    const existingUrls = new Set(existingLinks.map(l => normalizeUrl(l.link)))
    const filtered = mapped.filter(Boolean).filter(ev => !existingUrls.has(normalizeUrl(ev.link)))
    setEvents(filtered)
    setSelected(new Set(filtered.map(e => e.id)))
    setStatus(filtered.length === 0 ? 'empty' : 'ready')
  }

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleImport() {
    setStatus('importing')
    const toImport = events.filter(e => selected.has(e.id))
    let failures = 0
    for (const ev of toImport) {
      const { id, displayTime, repeatLabel, platform, ...payload } = ev
      try { await linksApi.create(payload) } catch { failures++ }
    }
    onImport()
    if (failures > 0) {
      setErrorMsg(`Imported ${toImport.length - failures} of ${toImport.length} meeting${toImport.length !== 1 ? 's' : ''}. ${failures} failed.`)
      setStatus('error')
    } else {
      onClose()
    }
  }

  function handleRetry() {
    setStatus('loading')
    if (provider === 'google') {
      if (cachedGoogleToken && Date.now() < googleTokenExpiry) {
        handleGoogleToken({ access_token: cachedGoogleToken })
      } else if (googleClientRef.current) {
        googleClientRef.current.requestAccessToken()
      } else {
        startGoogleAuth()
      }
    } else {
      connectMicrosoft()
    }
  }

  const title = provider === 'google' ? 'Import from Google Calendar' : 'Import from Outlook'
  const spinnerLabel = provider === 'google' ? 'Connecting to Google Calendar...' : 'Connecting to Outlook...'

  return (
    <div className="ci-overlay" onClick={onClose}>
      <div className="ci-card" onClick={e => e.stopPropagation()}>
        <div className="ci-header">
          <span className="ci-title">{title}</span>
          <button className="ci-close" onClick={onClose}>×</button>
        </div>

        {status === 'loading' && (
          <div className="ci-state">
            <div className="ci-spinner" />
            <p>{spinnerLabel}</p>
          </div>
        )}

        {status === 'needs-auth' && (
          <div className="ci-state">
            <button className="ci-retry" onClick={connectMicrosoft}>Connect to Outlook</button>
          </div>
        )}

        {status === 'empty' && (
          <div className="ci-state">
            <p>No upcoming meetings with video links found.</p>
            <p className="ci-state-sub">Meetings must have a Zoom, Meet, Teams, or Webex link to be imported.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="ci-state">
            <p className="ci-error-text">{errorMsg}</p>
            <button className="ci-retry" onClick={handleRetry}>Try Again</button>
          </div>
        )}

        {(status === 'ready' || status === 'importing') && (
          <>
            <div className="ci-subheader">
              <span>{events.length} meeting{events.length !== 1 ? 's' : ''} found</span>
              {selected.size < events.length && (
                <button className="ci-select-all" onClick={() => setSelected(new Set(events.map(e => e.id)))}>
                  Select all
                </button>
              )}
            </div>
            <div className="ci-list">
              {events.map(ev => (
                <div
                  key={ev.id}
                  className={`ci-event${selected.has(ev.id) ? ' ci-event-on' : ''}`}
                  onClick={() => toggle(ev.id)}
                >
                  <div className={`ci-check${selected.has(ev.id) ? ' ci-check-on' : ''}`}>
                    {selected.has(ev.id) && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="ci-event-info">
                    <div className="ci-event-name">{ev.name}</div>
                    <div className="ci-event-meta">
                      {ev.days.join(', ')}
                      <span className="ci-sep"> · </span>
                      {ev.displayTime}
                      <span className="ci-sep"> · </span>
                      {ev.repeatLabel}
                    </div>
                  </div>
                  <div className={`ci-badge ci-badge-${ev.platform.toLowerCase().replace(' ', '-')}`}>{ev.platform}</div>
                </div>
              ))}
            </div>
            <div className="ci-footer">
              <button className="ci-cancel" onClick={onClose}>Cancel</button>
              <button
                className="ci-import-btn"
                onClick={handleImport}
                disabled={selected.size === 0 || status === 'importing'}
              >
                {status === 'importing'
                  ? 'Importing...'
                  : `Import ${selected.size} meeting${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
