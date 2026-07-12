import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getStatusSummary } from '../api/status.js'
import '../styles/status.css'

const STATUS_LABEL = {
  operational: 'All Systems Operational',
  degraded: 'Partial System Degradation',
  outage: 'Service Disruption',
  unknown: 'Status Unknown',
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function fmtDateShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function UptimeBar({ days }) {
  return (
    <div>
      <div className="st-uptime-bar">
        {days.map(d => {
          let cls = 'st-day--none'
          if (d.uptime_pct !== null) {
            if (d.uptime_pct >= 99) cls = 'st-day--ok'
            else if (d.uptime_pct >= 90) cls = 'st-day--warn'
            else cls = 'st-day--bad'
          }
          const title = d.uptime_pct !== null
            ? `${fmtDateShort(d.date + 'T00:00:00Z')}: ${d.uptime_pct}% uptime (${d.checks} checks)`
            : `${fmtDateShort(d.date + 'T00:00:00Z')}: no data`
          return <div key={d.date} className={`st-day ${cls}`} title={title} />
        })}
      </div>
      <div className="st-uptime-labels">
        <span>90 days ago</span>
        <span>Today</span>
      </div>
    </div>
  )
}

function IncidentCard({ incident, active }) {
  const [open, setOpen] = useState(active)
  return (
    <div className={`st-incident${active ? ' st-incident--active' : ''}`}>
      <div className="st-incident-header">
        <span className={`st-sev st-sev--${incident.severity}`}>{incident.severity}</span>
        <span className="st-incident-title">{incident.title}</span>
        <span className={`st-status-badge st-status-badge--${incident.status}`}>{incident.status}</span>
      </div>
      <div className="st-incident-meta">
        Started {fmtDate(incident.started_at)}
        {incident.resolved_at && ` · Resolved ${fmtDate(incident.resolved_at)}`}
      </div>
      {incident.affected_components?.length > 0 && (
        <div className="st-components">
          {incident.affected_components.map(c => (
            <span key={c} className="st-component-tag">{c}</span>
          ))}
        </div>
      )}
      {incident.timeline?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            style={{ background: 'none', border: 'none', font: '500 12px Montserrat', color: '#2563EB', cursor: 'pointer', padding: 0 }}
            onClick={() => setOpen(o => !o)}
          >
            {open ? 'Hide' : 'Show'} timeline ({incident.timeline.length})
          </button>
          {open && (
            <div className="st-timeline" style={{ marginTop: 10 }}>
              {[...incident.timeline].reverse().map((e, i) => (
                <div key={i} className="st-timeline-entry">
                  <div className="st-timeline-ts">{fmtDate(e.ts)}</div>
                  <div>{e.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Status() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getStatusSummary().then(setData).catch(() => setError(true))
  }, [])

  const overall = data?.overall ?? 'unknown'

  return (
    <div className="st-page">
      <header className="st-header">
        <Link to="/" className="st-header-logo">
          <img src="/images/logo.svg" alt="LinkJoin" />
          LinkJoin
        </Link>
        <span style={{ color: '#CBD5E1', marginLeft: 4 }}>/</span>
        <span style={{ fontSize: 15, color: '#64748B', fontWeight: 500 }}>Status</span>
      </header>

      <div className="st-body">
        {error ? (
          <div className="st-hero">
            <div className="st-hero-dot st-hero-dot--unknown" />
            <div className="st-hero-text">
              <p className="st-hero-title">Unable to load status</p>
              <p className="st-hero-sub">Try refreshing the page.</p>
            </div>
          </div>
        ) : !data ? (
          <div className="st-loading">Loading...</div>
        ) : (
          <>
            <div className="st-hero">
              <div className={`st-hero-dot st-hero-dot--${overall}`} />
              <div className="st-hero-text">
                <p className="st-hero-title">{STATUS_LABEL[overall]}</p>
                <p className="st-hero-sub">
                  {data.current_response_ms != null
                    ? `Response time: ${data.current_response_ms}ms`
                    : 'Monitoring active'}
                </p>
              </div>
              {data.uptime_30d != null && (
                <span className="st-hero-uptime">{data.uptime_30d}% uptime</span>
              )}
            </div>

            {data.active_incidents.length > 0 && (
              <div className="st-section">
                <div className="st-section-title">Active Incidents</div>
                {data.active_incidents.map(inc => (
                  <IncidentCard key={inc.incident_id} incident={inc} active />
                ))}
              </div>
            )}

            <div className="st-section">
              <div className="st-section-title">Uptime — Last 90 Days</div>
              {data.days.length > 0 ? (
                <>
                  <UptimeBar days={data.days} />
                  {data.uptime_90d != null && (
                    <p className="st-uptime-pct">
                      <strong>{data.uptime_90d}%</strong> uptime over the last 90 days
                    </p>
                  )}
                </>
              ) : (
                <p className="st-empty">Monitoring data will appear here after the first check runs.</p>
              )}
            </div>

            <div className="st-section">
              <div className="st-section-title">Past Incidents</div>
              {data.recent_incidents.length === 0 ? (
                <p className="st-empty">No incidents in the last 90 days.</p>
              ) : (
                data.recent_incidents.map(inc => (
                  <IncidentCard key={inc.incident_id} incident={inc} active={false} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
