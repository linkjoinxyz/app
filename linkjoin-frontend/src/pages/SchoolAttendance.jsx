import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/school.css'

export default function SchoolAttendance() {
  const [scrolled, setScrolled] = useState(false)
  const [visSet, setVisSet] = useState(new Set())

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

  const AWARDS = [
    { label: 'First Steps', color: '#D97706', earned: true },
    { label: 'On Point',    color: '#2B8FD8', earned: true },
    { label: 'Perfect Week',color: '#059669', earned: true },
    { label: 'Streak ×5',  color: '#D97706', earned: true },
    { label: 'Streak ×10', color: '#7C3AED', earned: false },
    { label: 'Champion',   color: '#059669', earned: false },
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
              <a href="mailto:seth@linkjoin.xyz" className="sc-btn-ghost">Request a demo</a>
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

      {/* S4: Your rules */}
      <section className="sc-section sc-wave-4">
        <div data-rid="s4" className={rc('s4', 'sc-hl')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Configurable</span>
            <h2 className="sc-h2">Set the bar. We'll track it.</h2>
            <p className="sc-body">
              Every school is different. Define what "tardy" means, when to flag
              students, and which days don't count. LinkJoin applies your rules to
              every calculation, including the export.
            </p>
            <ul className="sc-bullets">
              <li>Minutes late before counting as tardy (default: 5)</li>
              <li>Tardy rate threshold before flagging (default: 33%)</li>
              <li>Attendance rate threshold (default: below 50%)</li>
              <li>Academic calendar: add holidays and snow days so absences on those days aren't counted</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Alert Settings</span>
              </div>
              <div className="sc-settings-body">
                <div className="sc-settings-row">
                  <span className="sc-settings-label">Minutes late to count as tardy</span>
                  <div className="sc-settings-input">5</div>
                </div>
                <div className="sc-settings-row">
                  <span className="sc-settings-label">Flag when tardy rate exceeds</span>
                  <div className="sc-settings-input">33%</div>
                </div>
                <div className="sc-settings-row">
                  <span className="sc-settings-label">Flag when attendance falls below</span>
                  <div className="sc-settings-input">50%</div>
                </div>
                <div className="sc-settings-row">
                  <span className="sc-settings-label">Min sessions before flagging</span>
                  <div className="sc-settings-input">3</div>
                </div>
                <div className="sc-settings-cal-head">Academic Calendar</div>
                <div className="sc-settings-cal">
                  {['M','T','W','T','F'].map((d, i) => (
                    <div key={i} className="sc-cal-head">{d}</div>
                  ))}
                  {CAL_DAYS.map(({ n, off }) => (
                    <div key={n} className={`sc-cal-day${off ? ' sc-cal-day--off' : ''}`}>{n}</div>
                  ))}
                </div>
                <div className="sc-settings-cal-note">3 blackout dates excluded from all calculations</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S5: Intervention workflow */}
      <section className="sc-section sc-section--alt sc-wave-5">
        <div data-rid="s5" className={rc('s5', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Close the loop</span>
            <h2 className="sc-h2">From flag to follow-up in two clicks.</h2>
            <p className="sc-body">
              When a student is flagged, one click opens a case. Assign it to a
              counselor or admin, track it from Open to In Progress to Resolved,
              and build a written record with threaded notes.
            </p>
            <ul className="sc-bullets">
              <li>One active case per student per flag type, no duplicates</li>
              <li>Assign to any staff member by name or email</li>
              <li>Threaded notes with timestamps, a permanent record of what was done</li>
              <li>Status: Open → In Progress → Resolved</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Intervention case</span>
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
                  <div className="sc-iv-status-pill">In Progress</div>
                </div>
                <div className="sc-iv-card-assigned">
                  Assigned to: <strong>counselor@school.edu</strong>
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
                <div className="sc-iv-add">+ Add note...</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S6: Admin visibility */}
      <section className="sc-section sc-wave-6">
        <div data-rid="s6" className={rc('s6', 'sc-hl')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">School-wide</span>
            <h2 className="sc-h2">Every teacher's class. One place.</h2>
            <p className="sc-body">
              School admins see every open and in-progress intervention across every
              class, searchable by student name, flag type, or class, so nothing
              falls through the cracks.
            </p>
            <ul className="sc-bullets">
              <li>All interventions across all teachers in one list</li>
              <li>Filter by status: Open / In Progress / Resolved</li>
              <li>Search by student, teacher, or class name</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
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

      {/* S7: Student motivation */}
      <section className="sc-section sc-section--alt sc-wave-7">
        <div data-rid="s7" className={rc('s7', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">The student angle</span>
            <h2 className="sc-h2">Punctuality becomes its own reward.</h2>
            <p className="sc-body">
              Students see their own attendance record and earn awards for consistent
              on-time joins. Streaks and milestones give them a reason to log on early,
              without any teacher nudging.
            </p>
            <ul className="sc-bullets">
              <li>Current streak and best-ever streak</li>
              <li>On-time rate across all classes</li>
              <li>Six awards from First Steps to Monthly Champion</li>
              <li>Students track their own progress, no teacher nudging required</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Emma's profile</span>
              </div>
              <div className="sc-mock-rewards">
                <div className="sc-att-stats">
                  <div className="sc-att-stat">
                    <div className="sc-att-stat-num">12</div>
                    <div className="sc-att-stat-label">Day streak</div>
                  </div>
                  <div className="sc-att-stat-divider" />
                  <div className="sc-att-stat">
                    <div className="sc-att-stat-num">87%</div>
                    <div className="sc-att-stat-label">On-time rate</div>
                  </div>
                  <div className="sc-att-stat-divider" />
                  <div className="sc-att-stat">
                    <div className="sc-att-stat-num">15</div>
                    <div className="sc-att-stat-label">Best streak</div>
                  </div>
                </div>
                <div className="sc-awards-full">
                  {AWARDS.map(({ label, color, earned }) => (
                    <div key={label} className={`sc-award-item${earned ? '' : ' sc-award-item--locked'}`}>
                      <div
                        className="sc-award-icon"
                        style={earned ? { background: color } : undefined}
                      />
                      <div className="sc-award-name">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section data-rid="cta" className={rc('cta', 'sc-cta')}>
        <h2 className="sc-cta-h2">See it in action for your school.</h2>
        <p className="sc-cta-sub">Set up takes minutes. The first class auto-logs itself.</p>
        <div className="sc-cta-actions">
          <Link to="/signup" className="sc-btn-primary">Get started free</Link>
          <a href="mailto:seth@linkjoin.xyz" className="sc-btn-ghost">Request a demo</a>
        </div>
        <p className="sc-cta-note">↓ Export CSV any time. No lock-in.</p>
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
