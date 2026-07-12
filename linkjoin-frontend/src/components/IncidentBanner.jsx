import { useState, useEffect } from 'react'
import { incidentsApi } from '../api/incidents.js'
import '../styles/incident.css'

const SEV_ICON = { P0: 'x', P1: '!', P2: '!', P3: 'i' }

export default function IncidentBanner() {
  const [incidents, setIncidents] = useState([])
  const [dismissed, setDismissed] = useState(() => {
    try {
      const raw = sessionStorage.getItem('inc_dismissed')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    incidentsApi.getActive()
      .then(data => {
        if (Array.isArray(data)) {
          const highPriority = data.filter(i => i.severity === 'P0' || i.severity === 'P1')
          setIncidents(highPriority)
        }
      })
      .catch(() => {})
  }, [])

  function dismiss(id) {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      try { sessionStorage.setItem('inc_dismissed', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const visible = incidents.filter(i => !dismissed.has(i.incident_id))
  if (visible.length === 0) return null

  const top = visible[0]
  return (
    <div className={`inc-banner inc-banner--${top.severity}`} role="alert">
      <span className="inc-banner-icon" aria-hidden="true">
        {SEV_ICON[top.severity] || '!'}
      </span>
      <div className="inc-banner-body">
        <div className="inc-banner-title">{top.title}</div>
        <div className="inc-banner-meta">
          {top.severity} - {top.status} - {top.affected_components?.join(', ')}
          {visible.length > 1 && <span> (+{visible.length - 1} more)</span>}
        </div>
      </div>
      <button
        className="inc-banner-dismiss"
        onClick={() => dismiss(top.incident_id)}
        aria-label="Dismiss incident banner"
      >
        x
      </button>
    </div>
  )
}
