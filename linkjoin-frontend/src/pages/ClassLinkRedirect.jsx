import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../api/client.js'
import '../styles/premeet.css'

const SECS = 5
const CIRC = 2 * Math.PI * 38

// The `/c/:slug` redirect: resolves the slug via the backend (which logs
// attendance when eligible) and opens the real meeting URL. This is the one
// code path every class-linked join goes through — see attendance-integrity
// brief. Since this app uses Bearer-token auth (no cookie session), the
// "redirect" happens client-side after an authenticated API call, not as a
// literal server 302.
export default function ClassLinkRedirect() {
  const { slug } = useParams()
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [meeting, setMeeting] = useState(null)
  const [seconds, setSeconds] = useState(SECS)
  const [copied, setCopied] = useState(false)
  const [launched, setLaunched] = useState(false)
  const wasHiddenRef = useRef(document.visibilityState !== 'visible')

  useEffect(() => {
    document.documentElement.className = 'nobar'
    return () => { document.documentElement.className = '' }
  }, [])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') wasHiddenRef.current = true
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    apiGet(`/links/c/${slug}`)
      .then(data => { setMeeting(data); setStatus('ready') })
      .catch(() => setStatus('error'))
  }, [slug])

  const validLink = (() => {
    if (!meeting?.url) return false
    try {
      const { protocol } = new URL(meeting.url)
      return protocol === 'http:' || protocol === 'https:'
    } catch { return false }
  })()

  useEffect(() => {
    if (status !== 'ready' || !validLink || launched) return
    if (seconds <= 0) {
      setLaunched(true)
      window.open(meeting.url, '_blank', 'noopener,noreferrer')
      return
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds, status, validLink, launched, meeting])

  function joinNow() {
    if (!validLink || launched) return
    setLaunched(true)
    window.open(meeting.url, '_blank', 'noopener,noreferrer')
  }

  function dismiss() {
    setLaunched(true)
  }

  function copyPassword() {
    navigator.clipboard.writeText(meeting.password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setCopied('failed')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (status === 'loading') {
    return (
      <div className="pm-page">
        <div className="pm-logo">
          <Link to="/"><img src="/images/logo-text.svg" alt="LinkJoin" /></Link>
        </div>
        <div className="pm-card">
          <div className="pm-name">Loading meeting&hellip;</div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="pm-page">
        <div className="pm-logo">
          <Link to="/"><img src="/images/logo-text.svg" alt="LinkJoin" /></Link>
        </div>
        <div className="pm-card">
          <div className="pm-name">This link isn't valid</div>
          <div className="pm-sub">Ask your teacher for an updated link.</div>
        </div>
      </div>
    )
  }

  const dashOffset = CIRC * (1 - seconds / SECS)

  return (
    <div className="pm-page">
      <div className="pm-logo">
        <Link to="/"><img src="/images/logo-text.svg" alt="LinkJoin" /></Link>
      </div>

      <div className="pm-card">
        <div className="pm-name">{meeting.name || 'Your meeting'}</div>
        <div className="pm-sub">is starting soon</div>

        {validLink && (
          <div className="pm-ring-wrap">
            <svg viewBox="0 0 96 96" className="pm-ring-svg">
              <circle className="pm-ring-track" cx="48" cy="48" r="38" />
              <circle
                className="pm-ring-fill"
                cx="48" cy="48" r="38"
                style={{ strokeDashoffset: dashOffset }}
              />
            </svg>
            <span className="pm-seconds">{seconds}</span>
          </div>
        )}

        <div className="pm-actions">
          {meeting.password && (
            <button className="pm-btn pm-btn-ghost" onClick={copyPassword}>
              {copied === 'failed' ? 'Copy failed' : copied ? 'Copied!' : 'Copy password'}
            </button>
          )}
          {validLink && (
            <button className="pm-btn pm-btn-primary" onClick={joinNow}>
              Join now
            </button>
          )}
          {meeting.logged && (
            <div className="pm-sub" style={{ fontSize: '0.8em', opacity: 0.7 }}>
              Attendance recorded
            </div>
          )}
          {!launched && (
            <button className="pm-btn pm-btn-ghost" onClick={dismiss} style={{ opacity: 0.5 }}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
