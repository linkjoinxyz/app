import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { attendanceApi } from '../api/attendance.js'
import '../styles/premeet.css'

const SECS = 5
const CIRC = 2 * Math.PI * 38

export default function PreMeet() {
  const [params] = useSearchParams()
  const name = params.get('name') || 'Your meeting'
  const link = params.get('link') || ''
  const password = params.get('pw') || ''
  const linkId = params.get('linkId')
  const classId = params.get('classId')
  const className = params.get('className') || ''
  const sched = params.get('sched')
  const tracksAttendance = Boolean(linkId && classId)

  const [seconds, setSeconds] = useState(SECS)
  const [copied, setCopied] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [attended, setAttended] = useState(false)
  const wasHiddenRef = useRef(document.visibilityState !== 'visible')

  const validLink = (() => {
    try {
      const { protocol } = new URL(link)
      return protocol === 'http:' || protocol === 'https:'
    } catch { return false }
  })()

  useEffect(() => {
    document.documentElement.className = 'nobar'
    return () => { document.documentElement.className = '' }
  }, [])

  // Screen must have actually been on-screen for the countdown, not opened
  // in a background/backgrounded tab on an idle machine, to auto-confirm.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') wasHiddenRef.current = true
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  function confirmAttendance() {
    if (!tracksAttendance || attended) return
    const minutesLate = sched ? Math.round((Date.now() - new Date(sched).getTime()) / 60000) : 0
    attendanceApi.log(Number(linkId), classId, className, minutesLate)
      .then(() => setAttended(true))
      .catch(() => {})
  }

  useEffect(() => {
    if (!validLink || launched) return
    if (seconds <= 0) {
      setLaunched(true)
      window.open(link, '_blank', 'noopener,noreferrer')
      if (!wasHiddenRef.current) confirmAttendance()
      return
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds, validLink, launched, link])

  function joinNow() {
    if (!validLink) return
    if (!launched) {
      setLaunched(true)
      window.open(link, '_blank', 'noopener,noreferrer')
    }
    confirmAttendance()
  }

  function dismiss() {
    setLaunched(true)
  }

  function copyPassword() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setCopied('failed')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const dashOffset = CIRC * (1 - seconds / SECS)

  return (
    <div className="pm-page">
      <div className="pm-logo">
        <Link to="/"><img src="/images/logo-text.svg" alt="LinkJoin" /></Link>
      </div>

      <div className="pm-card">
        <div className="pm-name">{name}</div>
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
          {password && (
            <button className="pm-btn pm-btn-ghost" onClick={copyPassword}>
              {copied === 'failed' ? 'Copy failed' : copied ? 'Copied!' : 'Copy password'}
            </button>
          )}
          {validLink && (
            <button className="pm-btn pm-btn-primary" onClick={joinNow}>
              Join now
            </button>
          )}
          {tracksAttendance && attended && (
            <div className="pm-sub" style={{ fontSize: '0.8em', opacity: 0.7 }}>
              Attendance confirmed
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
