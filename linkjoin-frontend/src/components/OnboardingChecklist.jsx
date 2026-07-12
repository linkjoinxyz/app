import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useExtDetection } from '../hooks/useExtDetection.js'
import { usersApi } from '../api/users.js'
import { apiGet } from '../api/client.js'

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/add-to-linkjoin/mhncphjlaeeglmjpgdmclklebdfomele'

function Step({ done, label, action }) {
  return (
    <div className={`ob-step${done ? ' ob-step--done' : ''}`}>
      <span className="ob-step-check" aria-hidden="true">
        {done
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <span className="ob-step-circle" />}
      </span>
      <span className={`ob-step-label${done ? ' ob-step-label--done' : ''}`}>{label}</span>
      {!done && action && (
        typeof action === 'string'
          ? <a className="ob-step-btn" href={action} target="_blank" rel="noopener noreferrer">Go</a>
          : <button className="ob-step-btn" onClick={action.fn}>{action.label}</button>
      )}
    </div>
  )
}

export default function OnboardingChecklist({ links = [], classes = [] }) {
  const { role, markOnboardingDone } = useAuth()
  const navigate = useNavigate()
  const { installed: extInstalled, browser } = useExtDetection()
  const [dismissed, setDismissed] = useState(false)
  const [hasLink, setHasLink] = useState(links.length > 0)
  const [hasClass, setHasClass] = useState(classes.length > 0)

  useEffect(() => { setHasLink(links.length > 0) }, [links.length])
  useEffect(() => { setHasClass(classes.length > 0) }, [classes.length])

  if (dismissed) return null

  const isTeacher = role === 'teacher' || role === 'school_admin' || role === 'district_admin'
  const isStudent = role === 'student'
  const installUrl = browser === 'chrome' ? CHROME_STORE_URL : null

  let steps = []

  if (isTeacher) {
    steps = [
      { done: hasClass, label: 'Create your first class', action: { fn: () => navigate('/admin'), label: 'Go to Admin' } },
      { done: hasLink, label: 'Add your meeting link', action: { fn: () => navigate('/meetings'), label: 'Add link' } },
      { done: hasClass, label: 'Generate a student join code (in Admin > Classes)', action: null },
      { done: extInstalled, label: 'Install the browser extension', action: installUrl || undefined },
    ]
  } else if (isStudent) {
    steps = [
      { done: hasClass, label: 'Join a class with your teacher\'s join code', action: { fn: () => navigate('/meetings'), label: 'Join class' } },
      { done: extInstalled, label: 'Install the browser extension', action: installUrl || undefined },
    ]
  } else {
    return null
  }

  const doneCount = steps.filter(s => s.done).length
  const allDone = doneCount === steps.length

  async function handleDismiss() {
    setDismissed(true)
    markOnboardingDone()
    try { await usersApi.completeOnboarding() } catch {}
  }

  return (
    <div className="ob-checklist" role="region" aria-label="Getting started checklist">
      <div className="ob-checklist-header">
        <div className="ob-checklist-title">
          {allDone ? 'You\'re all set!' : 'Getting started'}
          <span className="ob-checklist-count">{doneCount}/{steps.length}</span>
        </div>
        <button className="ob-checklist-dismiss" onClick={handleDismiss} aria-label="Dismiss getting started checklist">
          {allDone ? 'Done' : 'Dismiss'}
        </button>
      </div>
      <div className="ob-checklist-progress">
        <div className="ob-checklist-bar" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <div className="ob-checklist-steps">
        {steps.map((s, i) => <Step key={i} {...s} />)}
      </div>
    </div>
  )
}
