import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/school.css'

export default function NewAttendance() {
  const [scrolled, setScrolled] = useState(false)
  const [visSet, setVisSet] = useState(new Set())
  const [activeTab, setActiveTab] = useState(0)
  const [premeetCountdown, setPremeetCountdown] = useState(3)
  const [premeetConfirmed, setPremeetConfirmed] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        const ids = entries
          .filter(e => e.isIntersecting && e.target.dataset.rid)
          .map(e => e.target.dataset.rid)
        if (ids.length) {
          setVisSet(prev => {
            const next = new Set(prev)
            ids.forEach(id => next.add(id))
            return next
          })
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    document.querySelectorAll('[data-rid]').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const rc = (id, base = '') =>
    [base, 'nh-reveal', visSet.has(id) ? 'nh-visible' : ''].filter(Boolean).join(' ')

  const premeetVisible = visSet.has('s1b')

  useEffect(() => {
    if (!premeetVisible) return
    let n = 3
    setPremeetCountdown(3)
    const id = setInterval(() => {
      n -= 1
      if (n < 0) {
        clearInterval(id)
        setPremeetConfirmed(true)
        return
      }
      setPremeetCountdown(n)
    }, 800)
    return () => clearInterval(id)
  }, [premeetVisible])

  const PREMEET_MOCK_SECS = 3
  const PREMEET_MOCK_CIRC = 2 * Math.PI * 38
  const premeetDashOffset = PREMEET_MOCK_CIRC * (1 - premeetCountdown / PREMEET_MOCK_SECS)

  const AWARDS = [
    {
      label: 'First Steps', color: '#D97706', desc: 'Attended a class for the first time', earned: true,
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    },
    {
      label: 'On Point', color: '#2B8FD8', desc: 'Joined on time at least once', earned: true,
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>,
    },
    {
      label: 'Perfect Week', color: '#059669', desc: 'On time every day in a Mon-Fri span', earned: true,
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="-3 -3 30 30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>,
    },
    {
      label: 'Streak x5', color: '#D97706', desc: 'Five consecutive on-time sessions', earned: true,
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    },
    {
      label: 'Streak x10', color: '#7C3AED', desc: 'Ten consecutive on-time sessions', earned: false,
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2z"/></svg>,
    },
    {
      label: 'Champion', color: '#059669', desc: 'Twenty-session on-time streak', earned: false,
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="-3 -3 30 30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>,
    },
  ]

  const CAL_DAYS = [
    {n:1},{n:2},{n:3},{n:4},{n:5},
    {n:8},{n:9},{n:10,off:true},{n:11,off:true},{n:12,off:true},
    {n:15},{n:16},{n:17},{n:18},{n:19},
  ]

  return (
    <div className="sc-root">
      {/* Nav */}
      <nav className={`sc-nav${scrolled ? ' sc-nav--scrolled' : ''}`}>
        <div className="sc-nav-left">
          <Link to="/" className="sc-nav-logo">
            <img src="/images/logo-text.svg" height="32" alt="LinkJoin" />
          </Link>
          <Link to="/schools" className="sc-nav-breadcrumb">← School features</Link>
        </div>
        <div className="sc-nav-right">
          <Link to="/login" className="sc-nav-login">Log in</Link>
          <Link to="/signup" className="sc-btn-primary">Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="sc-att-hero sc-wave-0">
        <div className="sc-att-hero-inner">
          <div className="sc-att-hero-text">
            <span className="sc-hero-eyebrow">Attendance tracking</span>
            <h1 className="sc-att-h1">Know who showed up before the bell stops ringing.</h1>
            <p className="sc-hero-sub">
              LinkJoin logs every student's join time the moment their device opens the
              meeting.
            </p>
            <div className="sc-hero-actions">
              <Link to="/signup" className="sc-btn-primary">Get started free</Link>
              <Link to="/demo" className="sc-btn-ghost">Request a demo</Link>
            </div>
          </div>
          <div className="sc-att-hero-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">AP Chemistry · Jun 24</span>
                <button className="sc-mock-export">↓ Export CSV</button>
              </div>
              <table className="sc-mock-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Maya R.</td>
                    <td className="sc-mock-td-muted">Jun 24</td>
                    <td>9:01 AM</td>
                    <td><span className="sc-badge sc-badge--green">On time</span></td>
                  </tr>
                  <tr>
                    <td>Jordan T.</td>
                    <td className="sc-mock-td-muted">Jun 24</td>
                    <td>9:04 AM</td>
                    <td><span className="sc-badge sc-badge--yellow">2m late</span></td>
                  </tr>
                  <tr>
                    <td>Alex K.</td>
                    <td className="sc-mock-td-muted">Jun 24</td>
                    <td>9:00 AM</td>
                    <td><span className="sc-badge sc-badge--green">On time</span></td>
                  </tr>
                  <tr>
                    <td>Sam L.</td>
                    <td className="sc-mock-td-muted">Jun 24</td>
                    <td>9:11 AM</td>
                    <td><span className="sc-badge sc-badge--red">10m late</span></td>
                  </tr>
                  <tr>
                    <td>Priya M.</td>
                    <td className="sc-mock-td-muted">Jun 24</td>
                    <td>8:59 AM</td>
                    <td><span className="sc-badge sc-badge--green">1m early</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* S1: Logs itself */}
      <section className="sc-section sc-section--alt sc-wave-1">
        <div data-rid="s1" className={rc('s1', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Zero effort</span>
            <h2 className="sc-h2">Attendance records itself. No teacher action required.</h2>
            <p className="sc-body">
              The moment a student's device auto-opens their meeting link at class time,
              LinkJoin captures the timestamp and computes their status. Teachers spend
              zero minutes on roll call.
            </p>
            <ul className="sc-bullets">
              <li>Join time recorded to the minute, automatically</li>
              <li>Status computed instantly: on time, slightly late, or late</li>
              <li>Works for every student on every device</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock sc-mock--pad">
              <div className="sc-att-flow">
                <div className="sc-att-flow-step">
                  <div className="sc-att-flow-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                  <div className="sc-att-flow-label">Link opens</div>
                  <div className="sc-att-flow-sub">Student's device at class time</div>
                </div>
                <div className="sc-att-flow-arrow">→</div>
                <div className="sc-att-flow-step">
                  <div className="sc-att-flow-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>
                  </div>
                  <div className="sc-att-flow-label">Time logged</div>
                  <div className="sc-att-flow-sub">Timestamp + minutes late computed</div>
                </div>
                <div className="sc-att-flow-arrow">→</div>
                <div className="sc-att-flow-step">
                  <div className="sc-att-flow-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  </div>
                  <div className="sc-att-flow-label">Available instantly</div>
                  <div className="sc-att-flow-sub">Teacher dashboard updates live</div>
                </div>
              </div>
              <div className="sc-att-flow-note">0 minutes of teacher time per class</div>
            </div>
          </div>
        </div>
      </section>

      {/* S1b: Verified presence */}
      <section className="sc-section">
        <div data-rid="s1b" className={rc('s1b', 'sc-hl')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Confirmed presence</span>
            <h2 className="sc-h2">Verify student joins.</h2>
            <p className="sc-body">
              LinkJoin only confirms attendance once the meeting screen was
              actually on-screen, not just open in the background, so an idle laptop
              can't rack up attendance on its own.
            </p>
            <ul className="sc-bullets">
              <li>Confirms only if the tab was visible for the full countdown</li>
              <li>A background or minimized tab never logs a "present"</li>
              <li>One button click confirms instantly, no extra step</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Student device</span>
              </div>
              <div className="sc-premeet-mock">
                <div className="sc-premeet-mock-name">English 10</div>
                <div className="sc-premeet-mock-sub">is starting soon</div>
                <div className={`sc-premeet-mock-ring${premeetConfirmed ? ' sc-premeet-mock-ring--confirmed' : ''}`}>
                  {!premeetConfirmed && (
                    <svg viewBox="0 0 96 96" className="sc-premeet-mock-ring-svg">
                      <circle className="sc-premeet-mock-ring-track" cx="48" cy="48" r="38" />
                      <circle
                        className="sc-premeet-mock-ring-fill"
                        cx="48" cy="48" r="38"
                        style={{ strokeDashoffset: premeetDashOffset }}
                      />
                    </svg>
                  )}
                  {premeetConfirmed ? (
                    <span className="sc-premeet-mock-ring-check" aria-hidden="true" />
                  ) : (
                    <span className="sc-premeet-mock-ring-num">{premeetCountdown}</span>
                  )}
                </div>
                <div className="sc-premeet-mock-actions">
                  <span className="sc-premeet-mock-btn">Join now</span>
                  <span className={`sc-premeet-mock-confirmed${premeetConfirmed ? ' sc-premeet-mock-confirmed--show' : ''}`}>
                    <span className="sc-premeet-mock-confirmed-check" aria-hidden="true" />
                    Attendance confirmed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S1c: Verified identity */}
      <section className="sc-section sc-section--alt">
        <div data-rid="s1c" className={rc('s1c', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Verified identity</span>
            <h2 className="sc-h2">Record attendance with 100% confidence.</h2>
            <p className="sc-body">
              Instead of tracking attendance by meeting username, records are created from the student's roster account,
              so the record is correct from the moment it's created.
            </p>
            <ul className="sc-bullets">
              <li>Meetings show device names, nicknames, or personal emails, not roster identities</li>
              <li>LinkJoin's attendance record is tied to the authenticated roster account</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-identity-compare">
                <div className="sc-identity-col sc-identity-col--bad">
                  <div className="sc-identity-col-title">Zoom participant log</div>
                  <div className="sc-identity-row">iPhone (3)</div>
                  <div className="sc-identity-row">senpai_1204@gmail.com</div>
                  <div className="sc-identity-row">Untitled</div>
                  <div className="sc-identity-row">Mom's iPad</div>
                </div>
                <div className="sc-identity-col sc-identity-col--good">
                  <div className="sc-identity-col-title">LinkJoin record</div>
                  <div className="sc-identity-row">Jordan Torres</div>
                  <div className="sc-identity-row">Maya Reynolds</div>
                  <div className="sc-identity-row">Sam Liu</div>
                  <div className="sc-identity-row">Priya Mehta</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S2: Every timestamp */}
      <section className="sc-section sc-wave-2">
        <div data-rid="s2" className={rc('s2', 'sc-hl')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">The full record</span>
            <h2 className="sc-h2">See exactly when every student joined.</h2>
            <p className="sc-body">
              Every session shows each student's name, join date and time, and status:
              on time (within 1 minute), slightly late (2-5 minutes), or late (over 5
              minutes). The record is always there when you need it.
            </p>
            <ul className="sc-bullets">
              <li>Date and clock time for every join event</li>
              <li>On time / slightly late / late classification per session</li>
              <li>Export the full class history to CSV any time</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">World-History-attendance.csv</span>
              </div>
              <div className="sc-csv-dl">
                <div className="sc-csv-dl-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" x2="12" y1="18" y2="12"/><line x1="9" x2="15" y1="15" y2="15"/></svg>
                </div>
                <div className="sc-csv-dl-info">
                  <div className="sc-csv-dl-name">World-History-attendance.csv</div>
                  <div className="sc-csv-dl-meta">23 records · 6 columns · 4.1 KB</div>
                </div>
                <button className="sc-mock-export">↓ Download</button>
              </div>
              <div className="sc-csv-preview">
                <div className="sc-csv-cols">
                  <span>student_name</span>
                  <span>email</span>
                  <span>date</span>
                  <span>join_time</span>
                  <span>minutes_late</span>
                  <span>status</span>
                </div>
                <div className="sc-csv-row">
                  <span>Maya Reynolds</span>
                  <span>maya@...</span>
                  <span>2024-06-24</span>
                  <span>09:01:03</span>
                  <span className="sc-csv-num sc-csv-num--good">-1</span>
                  <span className="sc-csv-status sc-csv-status--on">on_time</span>
                </div>
                <div className="sc-csv-row sc-csv-row--alt">
                  <span>Jordan Torres</span>
                  <span>jordan@...</span>
                  <span>2024-06-24</span>
                  <span>09:04:22</span>
                  <span className="sc-csv-num sc-csv-num--warn">4</span>
                  <span className="sc-csv-status sc-csv-status--late">slightly_late</span>
                </div>
                <div className="sc-csv-row">
                  <span>Sam Liu</span>
                  <span>sam@...</span>
                  <span>2024-06-23</span>
                  <span>09:11:47</span>
                  <span className="sc-csv-num sc-csv-num--bad">11</span>
                  <span className="sc-csv-status sc-csv-status--absent">late</span>
                </div>
                <div className="sc-csv-row sc-csv-row--alt">
                  <span>Priya Mehta</span>
                  <span>priya@...</span>
                  <span>2024-06-22</span>
                  <span>—</span>
                  <span className="sc-csv-num sc-csv-num--bad">—</span>
                  <span className="sc-csv-status sc-csv-status--absent">absent</span>
                </div>
                <div className="sc-csv-more">· · · 19 more rows</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S3: 28-day patterns */}
      <section className="sc-section sc-section--alt sc-wave-3">
        <div data-rid="s3" className={rc('s3', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Pattern detection</span>
            <h2 className="sc-h2">Problems surface before they become crises.</h2>
            <p className="sc-body">
              Every 28 days of sessions are analyzed per student. When a student's
              tardiness rate or absence rate crosses your threshold, they're flagged
              automatically. No manual review needed.
            </p>
            <ul className="sc-bullets">
              <li>28-day rolling attendance rate per student, per class</li>
              <li>Automatic flags: "Repeat tardy" and "Low attendance"</li>
              <li>Configurable thresholds: set what counts as a problem for your school</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Patterns · 28-day lookback</span>
              </div>
              <div className="sc-pattern-list">
                <div className="sc-pattern-cols">
                  <span>Student</span>
                  <span>Attendance</span>
                  <span>Tardy</span>
                </div>
                <div className="sc-pattern-row">
                  <div className="sc-pattern-row-main">
                    <div className="sc-pattern-name">Maya R.</div>
                    <div className="sc-pattern-bar-group">
                      <div className="sc-pattern-bar-wrap">
                        <div className="sc-pattern-bar-fill sc-pattern-bar--green" style={{width:'80%'}} />
                      </div>
                      <span className="sc-pattern-count">8/10</span>
                    </div>
                    <span className="sc-pattern-tardy">0</span>
                  </div>
                </div>
                <div className="sc-pattern-row sc-pattern-row--flagged">
                  <div className="sc-pattern-row-main">
                    <div className="sc-pattern-name">Jordan T.</div>
                    <div className="sc-pattern-bar-group">
                      <div className="sc-pattern-bar-wrap">
                        <div className="sc-pattern-bar-fill sc-pattern-bar--yellow" style={{width:'60%'}} />
                      </div>
                      <span className="sc-pattern-count">6/10</span>
                    </div>
                    <span className="sc-pattern-tardy sc-pattern-tardy--high">4</span>
                  </div>
                  <div className="sc-pattern-row-flags">
                    <span className="sc-badge sc-badge--yellow">Repeat tardy</span>
                    <button className="sc-pattern-action">Open case</button>
                  </div>
                </div>
                <div className="sc-pattern-row">
                  <div className="sc-pattern-row-main">
                    <div className="sc-pattern-name">Alex K.</div>
                    <div className="sc-pattern-bar-group">
                      <div className="sc-pattern-bar-wrap">
                        <div className="sc-pattern-bar-fill sc-pattern-bar--green" style={{width:'100%'}} />
                      </div>
                      <span className="sc-pattern-count">10/10</span>
                    </div>
                    <span className="sc-pattern-tardy">0</span>
                  </div>
                </div>
                <div className="sc-pattern-row sc-pattern-row--flagged">
                  <div className="sc-pattern-row-main">
                    <div className="sc-pattern-name">Sam L.</div>
                    <div className="sc-pattern-bar-group">
                      <div className="sc-pattern-bar-wrap">
                        <div className="sc-pattern-bar-fill sc-pattern-bar--red" style={{width:'40%'}} />
                      </div>
                      <span className="sc-pattern-count">4/10</span>
                    </div>
                    <span className="sc-pattern-tardy">2</span>
                  </div>
                  <div className="sc-pattern-row-flags">
                    <span className="sc-badge sc-badge--red">Low attendance</span>
                    <button className="sc-pattern-action">Open case</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S4: Zero hero — asymmetric big number + stacked companion stats */}
      <section className="sc-na-zero-section sc-wave-4">
        <div data-rid="s4" className={rc('s4', 'sc-na-zero-inner')}>
          <div className="sc-na-zero-left">
            <div className="sc-na-zero-numblock">
              <span className="sc-na-zero-digit">0</span>
              <span className="sc-na-zero-unit">min</span>
            </div>
            <p className="sc-na-zero-caption">
              of teacher time per class. Attendance records itself the moment a student's link opens.
            </p>
          </div>
          <div className="sc-na-zero-right">
            <div className="sc-na-zero-row">
              <span className="sc-na-zero-n">28</span>
              <div className="sc-na-zero-rtext">
                <div className="sc-na-zero-rlabel">days</div>
                <div className="sc-na-zero-rsub">rolling window analyzed per student</div>
              </div>
            </div>
            <div className="sc-na-zero-hr" />
            <div className="sc-na-zero-row">
              <span className="sc-na-zero-n">6</span>
              <div className="sc-na-zero-rtext">
                <div className="sc-na-zero-rlabel">awards</div>
                <div className="sc-na-zero-rsub">students earn for consistent on-time joins</div>
              </div>
            </div>
            <div className="sc-na-zero-hr" />
            <div className="sc-na-zero-row">
              <span className="sc-na-zero-n">100%</span>
              <div className="sc-na-zero-rtext">
                <div className="sc-na-zero-rlabel">automatic</div>
                <div className="sc-na-zero-rsub">tracking across every device and student</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S5: Vertical sidebar tabs */}
      <section className="sc-section sc-wave-5">
        <div data-rid="s5" className={rc('s5', 'sc-na-vtab-wrap')}>
          <div className="sc-na-vtab-sidebar">
            <span className="sc-eyebrow">Close the loop</span>
            <h2 className="sc-h2">From flag<br/>to follow-up.</h2>
            <p className="sc-body">When a student is flagged, one click opens a case. Assign it, track status, and build a written record.</p>
            <div className="sc-na-vtab-list">
              {[
                { title: 'Open a case', desc: 'One click from the patterns view' },
                { title: 'Track progress', desc: 'Assign, update status, hand off' },
                { title: 'Add notes', desc: 'Timestamped record, always preserved' },
              ].map((tab, i) => (
                <button
                  key={i}
                  className={`sc-na-vtab-btn${activeTab === i ? ' sc-na-vtab-btn--active' : ''}`}
                  onClick={() => setActiveTab(i)}
                >
                  <span className="sc-na-vtab-title">{tab.title}</span>
                  <span className="sc-na-vtab-desc">{tab.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sc-na-vtab-content">
            {activeTab === 0 && (
              <div className="sc-mock">
                <div className="sc-mock-header">
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <span className="sc-mock-header-title">Patterns · AP Chemistry</span>
                </div>
                <div className="sc-pattern-list">
                  <div className="sc-pattern-cols">
                    <span>Student</span>
                    <span>Attendance</span>
                    <span>Flags</span>
                    <span></span>
                  </div>
                  <div className="sc-pattern-row">
                    <div className="sc-pattern-row-main">
                      <div className="sc-pattern-name">Maya R.</div>
                      <div className="sc-pattern-bar-group">
                        <div className="sc-pattern-bar-wrap">
                          <div className="sc-pattern-bar-fill sc-pattern-bar--green" style={{width:'90%'}} />
                        </div>
                        <span className="sc-pattern-count">9/10</span>
                      </div>
                      <span style={{color:'rgba(13,27,42,0.2)', fontSize:12}}>—</span>
                      <span />
                    </div>
                  </div>
                  <div className="sc-pattern-row sc-pattern-row--flagged">
                    <div className="sc-pattern-row-main" style={{gridTemplateColumns:'1fr 1fr 1fr auto'}}>
                      <div className="sc-pattern-name">Jordan T.</div>
                      <div className="sc-pattern-bar-group">
                        <div className="sc-pattern-bar-wrap">
                          <div className="sc-pattern-bar-fill sc-pattern-bar--yellow" style={{width:'60%'}} />
                        </div>
                        <span className="sc-pattern-count">6/10</span>
                      </div>
                      <span className="sc-badge sc-badge--yellow">Repeat tardy</span>
                      <button className="sc-pattern-action sc-na-action-highlight">Open case</button>
                    </div>
                  </div>
                  <div className="sc-pattern-row">
                    <div className="sc-pattern-row-main">
                      <div className="sc-pattern-name">Alex K.</div>
                      <div className="sc-pattern-bar-group">
                        <div className="sc-pattern-bar-wrap">
                          <div className="sc-pattern-bar-fill sc-pattern-bar--green" style={{width:'100%'}} />
                        </div>
                        <span className="sc-pattern-count">10/10</span>
                      </div>
                      <span style={{color:'rgba(13,27,42,0.2)', fontSize:12}}>—</span>
                      <span />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 1 && (
              <div className="sc-mock">
                <div className="sc-mock-header">
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <span className="sc-mock-header-title">Intervention case · Jordan T.</span>
                </div>
                <div className="sc-iv-card">
                  <div className="sc-iv-card-top">
                    <div>
                      <div className="sc-iv-card-name">Jordan T.</div>
                      <div className="sc-iv-card-flag">
                        <span className="sc-badge sc-badge--yellow">Repeat tardy</span>
                        <span className="sc-iv-card-class">AP Chemistry</span>
                      </div>
                    </div>
                    <div className="sc-iv-status-pill sc-iv-status-pill--progress">In Progress</div>
                  </div>
                  <div className="sc-iv-card-assigned">
                    Assigned to: <strong>counselor@school.edu</strong>
                  </div>
                  <div className="sc-na-status-row">
                    <div className="sc-na-status-option sc-na-status-option--done">Open</div>
                    <div className="sc-na-status-arrow">→</div>
                    <div className="sc-na-status-option sc-na-status-option--active">In Progress</div>
                    <div className="sc-na-status-arrow">→</div>
                    <div className="sc-na-status-option">Resolved</div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 2 && (
              <div className="sc-mock">
                <div className="sc-mock-header">
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <span className="sc-mock-header-title">Intervention case · Jordan T.</span>
                </div>
                <div className="sc-iv-card">
                  <div className="sc-iv-card-top">
                    <div>
                      <div className="sc-iv-card-name">Jordan T.</div>
                      <div className="sc-iv-card-flag">
                        <span className="sc-badge sc-badge--yellow">Repeat tardy</span>
                        <span className="sc-iv-card-class">AP Chemistry</span>
                      </div>
                    </div>
                    <div className="sc-iv-status-pill sc-iv-status-pill--progress">In Progress</div>
                  </div>
                  <div className="sc-iv-divider" />
                  <div className="sc-iv-thread">
                    <div className="sc-iv-note">
                      <div className="sc-iv-note-meta">Jun 20 · admin@school.edu</div>
                      <div className="sc-iv-note-text">Spoke with student. Alarm issue, monitoring this week.</div>
                    </div>
                    <div className="sc-iv-note">
                      <div className="sc-iv-note-meta">Jun 22 · counselor@school.edu</div>
                      <div className="sc-iv-note-text">Parent contacted via email. Follow up next week.</div>
                    </div>
                  </div>
                  <div className="sc-iv-add sc-na-add-note-hint">
                    <span>+ Add note...</span>
                    <span className="sc-na-add-note-meta">timestamps preserved forever</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* S6: Admin view — 2-column split */}
      <section className="sc-na-admin-section sc-wave-6">
        <div data-rid="s6" className={rc('s6', 'sc-na-admin-inner')}>
          <div className="sc-na-admin-text">
            <span className="sc-eyebrow">School-wide</span>
            <h2 className="sc-h2">Every teacher's class. One place.</h2>
            <p className="sc-body">School admins see every open intervention across every teacher's class, searchable and filterable, so nothing slips through.</p>
            <ul className="sc-bullets">
              <li>Search across all classes and teachers</li>
              <li>Filter by status: open, in progress, resolved</li>
              <li>See who owns each case at a glance</li>
            </ul>
          </div>
          <div className="sc-na-admin-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">All interventions</span>
              </div>
              <div className="sc-admin-body">
                <div className="sc-admin-search-bar">
                  <span className="sc-admin-search-icon">⌕</span>
                  <span className="sc-admin-search-placeholder">Search students, classes...</span>
                </div>
                <div className="sc-admin-tabs">
                  <button className="sc-admin-tab sc-admin-tab--active">Open</button>
                  <button className="sc-admin-tab">In Progress</button>
                  <button className="sc-admin-tab">All</button>
                </div>
                <div className="sc-admin-rows">
                  <div className="sc-admin-row">
                    <div className="sc-admin-row-left">
                      <div className="sc-admin-row-name">Jordan T.</div>
                      <div className="sc-admin-row-meta">AP Chemistry · Ms. Rivera</div>
                    </div>
                    <div className="sc-admin-row-right">
                      <span className="sc-badge sc-badge--yellow">Repeat tardy</span>
                      <span className="sc-admin-status sc-admin-status--progress">In Progress</span>
                    </div>
                  </div>
                  <div className="sc-admin-row">
                    <div className="sc-admin-row-left">
                      <div className="sc-admin-row-name">Sam L.</div>
                      <div className="sc-admin-row-meta">World History · Mr. Chen</div>
                    </div>
                    <div className="sc-admin-row-right">
                      <span className="sc-badge sc-badge--red">Low attendance</span>
                      <span className="sc-admin-status sc-admin-status--open">Open</span>
                    </div>
                  </div>
                  <div className="sc-admin-row">
                    <div className="sc-admin-row-left">
                      <div className="sc-admin-row-name">Devon M.</div>
                      <div className="sc-admin-row-meta">Biology · Dr. Osei</div>
                    </div>
                    <div className="sc-admin-row-right">
                      <span className="sc-badge sc-badge--yellow">Repeat tardy</span>
                      <span className="sc-admin-status sc-admin-status--open">Open</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S7: Achievement path */}
      <section className="sc-section sc-wave-7">
        <div data-rid="s7" className={rc('s7', 'sc-na-awards-outer')}>
          <span className="sc-eyebrow sc-na-centered-label">Student engagement</span>
          <h2 className="sc-h2 sc-na-centered-h2">Punctuality becomes its own reward.</h2>
          <p className="sc-body sc-na-centered-body">
            Students see their own attendance record and earn awards for consistent
            on-time joins. Six milestones give them a reason to log on early, without
            any teacher nudging.
          </p>

          <div className="sc-na-streak-bar">
            <div className="sc-na-streak-stat">
              <div className="sc-na-streak-num">12</div>
              <div className="sc-na-streak-label">Day streak</div>
            </div>
            <div className="sc-na-streak-divider" />
            <div className="sc-na-streak-stat">
              <div className="sc-na-streak-num">87%</div>
              <div className="sc-na-streak-label">On-time rate</div>
            </div>
            <div className="sc-na-streak-divider" />
            <div className="sc-na-streak-stat">
              <div className="sc-na-streak-num">15</div>
              <div className="sc-na-streak-label">Best streak</div>
            </div>
          </div>

          <div className="sc-na-path">
            <div className="sc-na-path-track">
              {AWARDS.map(({ label, color, earned, icon }, i) => (
                <React.Fragment key={label}>
                  <div
                    className={`sc-na-path-node${earned ? ' sc-na-path-node--earned' : ''}`}
                    style={earned ? { background: color + '20', color } : undefined}
                  >
                    {icon}
                  </div>
                  {i < AWARDS.length - 1 && (
                    <div className={`sc-na-path-line${earned && AWARDS[i + 1].earned ? ' sc-na-path-line--earned' : ''}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
            <div className="sc-na-path-labels">
              {AWARDS.map(({ label, desc, earned }, i) => (
                <React.Fragment key={label}>
                  <div className={`sc-na-path-litem${earned ? ' sc-na-path-litem--earned' : ''}`}>
                    <div className="sc-na-path-lname">{label}</div>
                    <div className="sc-na-path-ldesc">{desc}</div>
                  </div>
                  {i < AWARDS.length - 1 && <div className="sc-na-path-lspacer" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA — split layout */}
      <section data-rid="cta" className={rc('cta', 'sc-na-cta-split')}>
        <div className="sc-na-cta-split-inner">
          <div className="sc-na-cta-split-text">
            <h2 className="sc-na-cta-split-h2">See it in action<br/>for your school.</h2>
            <p className="sc-na-cta-split-sub">Set up takes minutes. The first class auto-logs itself.</p>
          </div>
          <div className="sc-na-cta-split-actions">
            <Link to="/signup" className="sc-na-cta-split-primary">Get started free</Link>
            <Link to="/demo" className="sc-na-cta-split-ghost">Request a demo →</Link>
            <p className="sc-na-cta-split-note">Export CSV any time. No lock-in.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="sc-footer">
        <div className="sc-footer-brand">
          <img src="/images/logo-text.svg" height="28" alt="LinkJoin" />
          <p>Students online on time, every time.</p>
        </div>
        <div className="sc-footer-cols">
          <div className="sc-footer-col">
            <p className="sc-footer-col-title">Schools</p>
            <Link to="/schools">← All school features</Link>
            <Link to="/privacy-schools">Privacy for Schools</Link>
            <Link to="/dpa">DPA</Link>
            <Link to="/subprocessors">Subprocessors</Link>
          </div>
          <div className="sc-footer-col">
            <p className="sc-footer-col-title">Company</p>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/tos">Terms</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
        <div className="sc-footer-bottom">
          <span>© {new Date().getFullYear()} LinkJoin. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
