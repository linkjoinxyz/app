import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/school.css'

const TEACHER_AVATARS = [
  { name: 'Ms. Rivera', email: 'rivera@school.edu', color: '#2B8FD8', classes: 3 },
  { name: 'Mr. Chen',   email: 'chen@school.edu',   color: '#7C3AED', classes: 2 },
  { name: 'Dr. Osei',   email: 'osei@school.edu',   color: '#059669', classes: 4 },
]

const CLASS_CARDS = [
  { name: 'AP Chemistry',  time: '9:00 AM', days: ['Mon','Wed','Fri'], students: 22, links: 1 },
  { name: 'World History', time: '11:30 AM', days: ['Tue','Thu'],      students: 28, links: 1 },
  { name: 'Biology',       time: '1:15 PM', days: ['Mon','Wed','Fri'], students: 19, links: 1 },
]

const DETAIL_TABS = ['Links', 'Students', 'Attendance', 'Patterns', 'Interventions', 'Integrations']

export default function SchoolDashboards() {
  const [scrolled, setScrolled]   = useState(false)
  const [visSet,   setVisSet]     = useState(new Set())
  const [expanded, setExpanded]   = useState(0)
  const [detailTab, setDetailTab] = useState(2)

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
      <section className="sc-att-hero sc-wave-d0">
        <div className="sc-att-hero-inner">
          <div className="sc-att-hero-text">
            <span className="sc-hero-eyebrow">Multi-level dashboards</span>
            <h1 className="sc-att-h1">Every class in your school. Right here.</h1>
            <p className="sc-hero-sub">
              School admins get a full view of every teacher's classes, every student's
              attendance, and every open intervention, without asking anyone for a report.
            </p>
            <div className="sc-hero-actions">
              <Link to="/signup" className="sc-btn-primary">Get started free</Link>
              <Link to="/demo" className="sc-btn-ghost">Request a demo</Link>
            </div>
          </div>
          <div className="sc-att-hero-visual">
            <div className="sc-mock" style={{maxWidth:'100%'}}>
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">All teachers</span>
                <span className="sc-mock-export">3 teachers · 9 classes</span>
              </div>
              <div className="sc-teacher-search">
                <span className="sc-admin-search-icon">⌕</span>
                <span className="sc-admin-search-placeholder">Search teachers...</span>
              </div>
              <div className="sc-teacher-list">
                {TEACHER_AVATARS.map((t, i) => (
                  <div key={t.name}>
                    <div
                      className={`sc-teacher-row${expanded === i ? ' sc-teacher-row--open' : ''}`}
                      onClick={() => setExpanded(expanded === i ? -1 : i)}
                    >
                      <div className="sc-teacher-avatar" style={{background: t.color}}>
                        {t.name[3]}
                      </div>
                      <div className="sc-teacher-info">
                        <div className="sc-teacher-name">{t.name}</div>
                        <div className="sc-teacher-email">{t.email}</div>
                      </div>
                      <span className="sc-teacher-chip">{t.classes} classes</span>
                      <span className="sc-teacher-chevron">{expanded === i ? '▾' : '›'}</span>
                    </div>
                    {expanded === i && (
                      <div className="sc-teacher-classes">
                        {CLASS_CARDS.slice(0, 2).map(c => (
                          <div key={c.name} className="sc-class-mini">
                            <div className="sc-class-mini-name">{c.name}</div>
                            <div className="sc-class-mini-time">{c.time}</div>
                            <div className="sc-class-mini-days">
                              {c.days.map(d => (
                                <span key={d} className="sc-class-mini-day">{d}</span>
                              ))}
                            </div>
                            <div className="sc-class-mini-stat">{c.students} students</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S1: Role switcher - vertical sidebar tabs */}
      <section className="sc-section sc-section--alt sc-wave-d1">
        <div data-rid="s1" className={rc('s1', 'sc-na-vtab-wrap')}>
          <div className="sc-na-vtab-sidebar">
            <span className="sc-eyebrow">Every level, one tool</span>
            <h2 className="sc-h2">The right view for every role.</h2>
            <p className="sc-body">Roles are enforced automatically. Each person sees exactly what they should. Nothing more.</p>
            <div className="sc-na-vtab-list">
              {[
                { title: 'Teacher', desc: 'Their own classes, students, and attendance' },
                { title: 'School admin', desc: 'Every teacher, every class, every case' },
                { title: 'District admin', desc: 'All schools in one place' },
              ].map((tab, i) => (
                <button
                  key={i}
                  className={`sc-na-vtab-btn${expanded === i ? ' sc-na-vtab-btn--active' : ''}`}
                  onClick={() => setExpanded(i)}
                >
                  <span className="sc-na-vtab-title">{tab.title}</span>
                  <span className="sc-na-vtab-desc">{tab.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sc-na-vtab-content">
            {expanded === 0 && (
              <div className="sc-mock sc-mock--pad">
                <div className="sc-dash-grid">
                  {CLASS_CARDS.map((c, idx) => (
                    <div key={c.name} className={`sc-class-card-full${idx === 0 ? ' sc-class-card-full--active' : ''}`}>
                      <div className="sc-class-card-name">{c.name}</div>
                      <div className="sc-class-card-time">{c.time}</div>
                      <div className="sc-class-card-days">
                        {c.days.map(d => <span key={d} className="sc-class-mini-day">{d}</span>)}
                      </div>
                      <div className="sc-class-card-footer">
                        <span>{c.students} students</span>
                        <span>{c.links} link</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="sc-teacher-class-detail">
                  <div className="sc-detail-header">
                    <div className="sc-detail-class-name">AP Chemistry</div>
                    <div className="sc-detail-meta">
                      <span className="sc-detail-time">9:00 AM</span>
                      {['Mon','Wed','Fri'].map(d => <span key={d} className="sc-class-mini-day">{d}</span>)}
                      <span className="sc-detail-count">22 students</span>
                    </div>
                  </div>
                  <div className="sc-detail-tabs">
                    {['Links', 'Students', 'Attendance', 'Patterns', 'Interventions', 'Integrations'].map((tab, i) => (
                      <button key={tab} className={`sc-detail-tab${i === 2 ? ' sc-detail-tab--active' : ''}`}>
                        {tab}
                        {tab === 'Interventions' && <span className="sc-detail-tab-badge">2</span>}
                      </button>
                    ))}
                  </div>
                  <table className="sc-mock-table">
                    <thead><tr><th>Student</th><th>Time</th><th>Status</th></tr></thead>
                    <tbody>
                      <tr><td>Maya R.</td><td>9:01 AM</td><td><span className="sc-badge sc-badge--green">On time</span></td></tr>
                      <tr><td>Jordan T.</td><td>9:04 AM</td><td><span className="sc-badge sc-badge--yellow">2m late</span></td></tr>
                      <tr><td>Sam L.</td><td className="sc-mock-absent-time">Not joined</td><td><span className="sc-badge sc-badge--red">Absent</span></td></tr>
                      <tr><td>Priya M.</td><td>9:02 AM</td><td><span className="sc-badge sc-badge--green">On time</span></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {expanded === 1 && (
              <div className="sc-mock">
                <div className="sc-mock-header">
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <span className="sc-mock-header-title">All teachers</span>
                  <span className="sc-mock-export">3 teachers · 9 classes</span>
                </div>
                <div className="sc-teacher-search">
                  <span className="sc-admin-search-icon">⌕</span>
                  <span className="sc-admin-search-placeholder">Search teachers...</span>
                </div>
                <div className="sc-teacher-list">
                  <div className="sc-teacher-row sc-teacher-row--open">
                    <div className="sc-teacher-avatar" style={{background:'#2B8FD8'}}>R</div>
                    <div className="sc-teacher-info">
                      <div className="sc-teacher-name">Ms. Rivera</div>
                      <div className="sc-teacher-email">rivera@school.edu</div>
                    </div>
                    <span className="sc-teacher-chip">3 classes</span>
                    <span className="sc-teacher-chevron">▾</span>
                  </div>
                  <div className="sc-teacher-classes">
                    <div className="sc-class-mini">
                      <div className="sc-class-mini-name">AP Chemistry</div>
                      <div className="sc-class-mini-time">9:00 AM</div>
                      <div className="sc-class-mini-days">
                        {['Mon','Wed','Fri'].map(d => <span key={d} className="sc-class-mini-day">{d}</span>)}
                      </div>
                      <div className="sc-class-mini-stat">22 students</div>
                    </div>
                  </div>
                  <div className="sc-teacher-row">
                    <div className="sc-teacher-avatar" style={{background:'#7C3AED'}}>C</div>
                    <div className="sc-teacher-info">
                      <div className="sc-teacher-name">Mr. Chen</div>
                      <div className="sc-teacher-email">chen@school.edu</div>
                    </div>
                    <span className="sc-teacher-chip">2 classes</span>
                    <span className="sc-teacher-chevron">›</span>
                  </div>
                  <div className="sc-teacher-row">
                    <div className="sc-teacher-avatar" style={{background:'#059669'}}>O</div>
                    <div className="sc-teacher-info">
                      <div className="sc-teacher-name">Dr. Osei</div>
                      <div className="sc-teacher-email">osei@school.edu</div>
                    </div>
                    <span className="sc-teacher-chip">4 classes</span>
                    <span className="sc-teacher-chevron">›</span>
                  </div>
                </div>
              </div>
            )}
            {expanded === 2 && (
              <div className="sc-mock">
                <div className="sc-mock-header">
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <div className="sc-mock-header-dot" />
                  <span className="sc-mock-header-title">District overview</span>
                  <span className="sc-mock-export">4 schools</span>
                </div>
                <div className="sc-admin-body">
                  <div className="sc-admin-tabs">
                    <button className="sc-admin-tab sc-admin-tab--active">Schools</button>
                    <button className="sc-admin-tab">Interventions</button>
                    <button className="sc-admin-tab">Export</button>
                  </div>
                  <div className="sc-admin-rows">
                    {[
                      { name: 'Lincoln High', teachers: 18, classes: 54, rate: '91%' },
                      { name: 'Jefferson Middle', teachers: 12, classes: 36, rate: '87%' },
                      { name: 'Roosevelt K-8', teachers: 9, classes: 27, rate: '93%' },
                    ].map(s => (
                      <div key={s.name} className="sc-admin-row">
                        <div className="sc-admin-row-left">
                          <div className="sc-admin-row-name">{s.name}</div>
                          <div className="sc-admin-row-meta">{s.teachers} teachers · {s.classes} classes</div>
                        </div>
                        <div className="sc-admin-row-right">
                          <span className="sc-badge sc-badge--green">{s.rate} on-time</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* S2: Drill-down number hero */}
      <section className="sc-na-zero-section sc-wave-d2">
        <div data-rid="s2" className={rc('s2', 'sc-na-zero-inner')}>
          <div className="sc-na-zero-left">
            <div className="sc-na-zero-numblock">
              <span className="sc-na-zero-digit">3</span>
              <span className="sc-na-zero-unit">clicks</span>
            </div>
            <p className="sc-na-zero-caption">
              from the district overview to any individual student's full attendance record. No downloads, no reports, no asking.
            </p>
          </div>
          <div className="sc-na-zero-right">
            <div className="sc-na-zero-row">
              <span className="sc-na-zero-n sc-na-zero-n--accent">District</span>
              <div className="sc-na-zero-rtext">
                <div className="sc-na-zero-rlabel">All schools</div>
                <div className="sc-na-zero-rsub">on-time rates and open cases, school by school</div>
              </div>
            </div>
            <div className="sc-na-zero-hr" />
            <div className="sc-na-zero-row">
              <span className="sc-na-zero-n sc-na-zero-n--accent">School</span>
              <div className="sc-na-zero-rtext">
                <div className="sc-na-zero-rlabel">All teachers and classes</div>
                <div className="sc-na-zero-rsub">searchable list, expandable per teacher</div>
              </div>
            </div>
            <div className="sc-na-zero-hr" />
            <div className="sc-na-zero-row">
              <span className="sc-na-zero-n sc-na-zero-n--accent">Student</span>
              <div className="sc-na-zero-rtext">
                <div className="sc-na-zero-rlabel">Full record</div>
                <div className="sc-na-zero-rsub">every join, every absence, every flag</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S3: Full-width class detail spotlight */}
      <section className="sc-section sc-section--alt sc-wave-d3">
        <div data-rid="s3" className={rc('s3', 'sc-sd-spotlight')}>
          <div className="sc-sd-spotlight-head">
            <span className="sc-eyebrow">Full class access</span>
            <h2 className="sc-h2">Everything in one screen. No extra clicks.</h2>
            <p className="sc-body sc-sd-spotlight-sub">Attendance log, 28-day patterns, student roster, and open cases. All on one screen when you open any class.</p>
          </div>
          <div className="sc-sd-spotlight-frame">
            <div className="sc-mock" style={{maxWidth:'100%'}}>
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">AP Chemistry</span>
              </div>
              <div className="sc-detail-header">
                <div className="sc-detail-class-name">AP Chemistry</div>
                <div className="sc-detail-meta">
                  <span className="sc-detail-time">9:00 AM</span>
                  {['Mon','Wed','Fri'].map(d => <span key={d} className="sc-class-mini-day">{d}</span>)}
                  <span className="sc-detail-count">22 students</span>
                </div>
              </div>
              <div className="sc-detail-tabs">
                {DETAIL_TABS.map((tab, i) => (
                  <button key={tab} className={`sc-detail-tab${i === detailTab ? ' sc-detail-tab--active' : ''}`} onClick={() => setDetailTab(i)}>
                    {tab}
                    {tab === 'Interventions' && <span className="sc-detail-tab-badge">2</span>}
                    {tab === 'Integrations' && <span className="sc-detail-tab-dot" />}
                  </button>
                ))}
              </div>
              {detailTab === 0 && (
                <div className="sc-sd-tab-body">
                  <div className="sc-sd-link-row">
                    <div className="sc-sd-link-icon">Z</div>
                    <div className="sc-sd-link-info">
                      <div className="sc-sd-link-name">AP Chemistry - Zoom</div>
                      <div className="sc-sd-link-url">zoom.us/j/8273640192</div>
                    </div>
                    <span className="sc-badge sc-badge--green">Active</span>
                  </div>
                  <p className="sc-sd-tab-hint">Students join this link when the class starts. LinkJoin tracks who joins and when.</p>
                </div>
              )}
              {detailTab === 1 && (
                <div className="sc-sd-tab-body">
                  <table className="sc-mock-table">
                    <thead><tr><th>Student</th><th>Email</th><th>Attendance rate</th></tr></thead>
                    <tbody>
                      <tr><td>Maya R.</td><td>maya@school.edu</td><td><span className="sc-badge sc-badge--green">96%</span></td></tr>
                      <tr><td>Jordan T.</td><td>jordan@school.edu</td><td><span className="sc-badge sc-badge--yellow">78%</span></td></tr>
                      <tr><td>Sam L.</td><td>sam@school.edu</td><td><span className="sc-badge sc-badge--red">61%</span></td></tr>
                      <tr><td>Priya M.</td><td>priya@school.edu</td><td><span className="sc-badge sc-badge--green">100%</span></td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              {detailTab === 2 && (
                <>
                  <div className="sc-detail-stats">
                    <div className="sc-detail-stat-box">
                      <div className="sc-detail-stat-num">23</div>
                      <div className="sc-detail-stat-label">Records</div>
                    </div>
                    <div className="sc-detail-stat-box">
                      <div className="sc-detail-stat-num">87%</div>
                      <div className="sc-detail-stat-label">On-time avg</div>
                    </div>
                    <div className="sc-detail-stat-box sc-detail-stat-box--alert">
                      <div className="sc-detail-stat-num">2</div>
                      <div className="sc-detail-stat-label">Flagged</div>
                    </div>
                  </div>
                  <table className="sc-mock-table">
                    <thead><tr><th>Student</th><th>Time</th><th>Status</th></tr></thead>
                    <tbody>
                      <tr><td>Maya R.</td><td>9:01 AM</td><td><span className="sc-badge sc-badge--green">On time</span></td></tr>
                      <tr><td>Jordan T.</td><td>9:04 AM</td><td><span className="sc-badge sc-badge--yellow">2m late</span></td></tr>
                      <tr><td>Sam L.</td><td className="sc-mock-absent-time">Not joined</td><td><span className="sc-badge sc-badge--red">Absent</span></td></tr>
                    </tbody>
                  </table>
                </>
              )}
              {detailTab === 3 && (
                <div className="sc-sd-tab-body">
                  <table className="sc-mock-table">
                    <thead><tr><th>Student</th><th>Sessions</th><th>On-time rate</th><th>Flag</th></tr></thead>
                    <tbody>
                      <tr><td>Maya R.</td><td>12/13</td><td>96%</td><td></td></tr>
                      <tr><td>Jordan T.</td><td>10/13</td><td>72%</td><td><span className="sc-badge sc-badge--yellow">Repeat tardy</span></td></tr>
                      <tr><td>Sam L.</td><td>8/13</td><td>61%</td><td><span className="sc-badge sc-badge--red">Low attendance</span></td></tr>
                      <tr><td>Priya M.</td><td>13/13</td><td>100%</td><td></td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              {detailTab === 4 && (
                <div className="sc-sd-tab-body">
                  <div className="sc-admin-rows">
                    <div className="sc-admin-row">
                      <div className="sc-admin-row-left">
                        <div className="sc-admin-row-name">Jordan T.</div>
                        <div className="sc-admin-row-meta">Repeat tardy - 4 times in 2 weeks</div>
                      </div>
                      <div className="sc-admin-row-right">
                        <span className="sc-admin-status sc-admin-status--progress">In Progress</span>
                      </div>
                    </div>
                    <div className="sc-admin-row">
                      <div className="sc-admin-row-left">
                        <div className="sc-admin-row-name">Sam L.</div>
                        <div className="sc-admin-row-meta">Attendance below 65% over 28 days</div>
                      </div>
                      <div className="sc-admin-row-right">
                        <span className="sc-admin-status sc-admin-status--open">Open</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {detailTab === 5 && (
                <div className="sc-sd-tab-body">
                  <div className="sc-sd-integration-row">
                    <div className="sc-sd-integration-icon">
                      <span className="gc-g" style={{fontSize:15,fontWeight:700}}>G</span>
                    </div>
                    <div className="sc-sd-integration-info">
                      <div className="sc-sd-integration-name">Google Classroom</div>
                      <div className="sc-sd-integration-meta">AP Chemistry · Period 2</div>
                    </div>
                    <span className="sc-badge sc-badge--green">Connected</span>
                  </div>
                  <div className="sc-sd-integration-sync">
                    <span className="sc-sd-integration-sync-text">Last sync: Synced 19 of 22 students</span>
                    <button className="sc-sd-integration-sync-btn">Sync now</button>
                  </div>
                  <p className="sc-sd-tab-hint">Attendance scores post automatically to the "Attendance" assignment in your gradebook.</p>
                </div>
              )}
            </div>
          </div>
          <div className="sc-sd-callouts">
            <div className="sc-sd-callout">
              <div className="sc-sd-callout-dot" />
              <div className="sc-sd-callout-text">6 tabs, one screen, no separate pages</div>
            </div>
            <div className="sc-sd-callout">
              <div className="sc-sd-callout-dot" />
              <div className="sc-sd-callout-text">Live stats update as students join</div>
            </div>
            <div className="sc-sd-callout">
              <div className="sc-sd-callout-dot" />
              <div className="sc-sd-callout-text">Exact timestamps, not just present/absent</div>
            </div>
          </div>
        </div>
      </section>

      {/* S4: Role access comparison cards */}
      <section className="sc-sd-roles-section sc-wave-d4">
        <div data-rid="s4" className={rc('s4', 'sc-sd-roles-inner')}>
          <div className="sc-sd-roles-head">
            <span className="sc-eyebrow">Role-based access</span>
            <h2 className="sc-h2">No configuration.<br/>No one sees too much.</h2>
            <p className="sc-body">Roles are set when you add someone to your school. Everything else is automatic.</p>
          </div>
          <div className="sc-sd-roles-cards">
            {[
              {
                role: 'Teacher',
                icon: 'T',
                color: '#2B8FD8',
                sub: 'Their classes only',
                scopes: [
                  'Their own class grid',
                  'Full student roster per class',
                  'Complete attendance log',
                  'Patterns and late-join flags',
                  'Interventions for their classes',
                ],
              },
              {
                role: 'School admin',
                icon: 'A',
                color: '#7C3AED',
                sub: 'Full school access',
                scopes: [
                  'Every teacher and their classes',
                  'All attendance across the school',
                  'Every open intervention case',
                  'Search and filter across all data',
                  'Export to PowerSchool / CSV',
                ],
              },
              {
                role: 'District admin',
                icon: 'D',
                color: '#059669',
                sub: 'All schools',
                scopes: [
                  'Every school in the district',
                  'School-level attendance rates',
                  'Intervention cases across all schools',
                  'Click into any school or class',
                  'District-wide CSV exports',
                ],
              },
            ].map(({ role, icon, color, sub, scopes }) => (
              <div key={role} className="sc-sd-role-card">
                <div className="sc-sd-role-card-header" style={{background: color + '14', borderColor: color + '30'}}>
                  <div className="sc-hier-icon" style={{background: color, color: '#fff', width:36, height:36, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, flexShrink:0}}>{icon}</div>
                  <div>
                    <div className="sc-sd-role-name">{role}</div>
                    <div className="sc-sd-role-sub">{sub}</div>
                  </div>
                </div>
                <ul className="sc-sd-role-scopes">
                  {scopes.map(s => (
                    <li key={s} className="sc-sd-role-scope-item">
                      <span className="sc-sd-scope-dot" style={{background: color}} />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA: Split layout */}
      <section className="sc-na-cta-split sc-na-cta-split--alt">
        <div data-rid="cta" className={rc('cta', 'sc-na-cta-split-inner')}>
          <div className="sc-na-cta-split-text">
            <h2 className="sc-na-cta-split-h2">Give your admin team<br/>the visibility they need.</h2>
            <p className="sc-na-cta-split-sub">Set up takes minutes. Your teachers don't need to do anything.</p>
          </div>
          <div className="sc-na-cta-split-actions">
            <Link to="/signup" className="sc-na-cta-split-primary">Get started free</Link>
            <Link to="/demo" className="sc-na-cta-split-ghost">Request a demo →</Link>
            <p className="sc-na-cta-split-note">No card required. Cancel any time.</p>
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
