import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import '../styles/school.css'

const LMS_BRANDS = [
  { name: 'Google Classroom', logo: '/images/lms/google-classroom.svg' },
  { name: 'Canvas',           logo: '/images/lms/canvas.svg' },
  { name: 'Schoology',        logo: '/images/lms/schoology.png' },
  { name: 'Clever',           logo: '/images/lms/clever.svg' },
  { name: 'ClassLink',        logo: '/images/lms/classlink.png' },
  { name: 'OneRoster',        logo: '/images/lms/oneroster.png' },
]

export default function School() {
  const [scrolled, setScrolled] = useState(false)
  const [visSet, setVisSet] = useState(new Set())
  const [statCount, setStatCount] = useState(0)
  const trustRef = useRef(null)

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

  useEffect(() => {
    if (!trustRef.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      obs.disconnect()
      const target = 10000
      const duration = 1400
      const start = performance.now()
      function tick(now) {
        const elapsed = now - start
        const p = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setStatCount(Math.round(eased * target))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    obs.observe(trustRef.current)
    return () => obs.disconnect()
  }, [])

  const rc = (id, base = '') =>
    [base, 'nh-reveal', visSet.has(id) ? 'nh-visible' : ''].filter(Boolean).join(' ')

  const phoneVisible = visSet.has('phone')

  return (
    <div className="sc-root">
      {/* Nav */}
      <nav className={`sc-nav${scrolled ? ' sc-nav--scrolled' : ''}`}>
        <Link to="/" className="sc-nav-logo">
          <img src="/images/logo-text.svg" height="32" alt="LinkJoin" />
        </Link>
        <div className="sc-nav-right">
          <Link to="/login" className="sc-nav-login">Log in</Link>
          <Link to="/signup" className="sc-btn-primary">Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="sc-hero">
        <span className="sc-hero-eyebrow">For K-12 schools &amp; districts</span>
        <h1 className="sc-hero-h1">Students online on time, every time.</h1>
        <p className="sc-hero-sub">
          LinkJoin auto-opens virtual classes for your students and gives you
          real-time visibility into who showed up, when, and who needs follow-up.
        </p>
        <div className="sc-hero-actions">
          <Link to="/signup" className="sc-btn-primary">Get started</Link>
          <a href="mailto:seth@linkjoin.xyz" className="sc-btn-ghost">Request a demo</a>
        </div>
      </section>

      {/* Section 1: Attendance with real impact */}
      <section className="sc-section">
        <div data-rid="s1" className={rc('s1', 'sc-hl')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Real-time attendance</span>
            <h2 className="sc-h2">Attendance with real impact.</h2>
            <p className="sc-body">
              The moment class starts, you know exactly who joined, when, and how late.
              No manual roll calls, no guessing, no waiting.
            </p>
            <ul className="sc-bullets">
              <li>Auto-opens class links for students at the right time</li>
              <li>Live join times and late-arrival flags, per student</li>
              <li>One-click export to PowerSchool and Infinite Campus</li>
              <li>Historical records always available, no extra setup</li>
            </ul>
          </div>
          <div className="sc-hl-visual" style={{flexDirection:'column', alignItems:'stretch'}}>
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Algebra II · Today</span>
              </div>
              <table className="sc-mock-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Emma Wilson</td>
                    <td>8:59 AM</td>
                    <td><span className="sc-badge sc-badge--green">On time</span></td>
                  </tr>
                  <tr>
                    <td>Jake Martinez</td>
                    <td>9:07 AM</td>
                    <td><span className="sc-badge sc-badge--yellow">Late 7m</span></td>
                  </tr>
                  <tr>
                    <td>Aisha Okonkwo</td>
                    <td>9:00 AM</td>
                    <td><span className="sc-badge sc-badge--green">On time</span></td>
                  </tr>
                  <tr>
                    <td>Tyler Nguyen</td>
                    <td className="sc-mock-absent-time">Not joined</td>
                    <td><span className="sc-badge sc-badge--red">Absent</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Link to="/schools/attendance" className="sc-learn-more">See how it works →</Link>
          </div>
        </div>
      </section>

      {/* Section 2: Spot problems before they grow */}
      <section className="sc-section sc-section--alt">
        <div data-rid="s2" className={rc('s2', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Patterns &amp; interventions</span>
            <h2 className="sc-h2">Spot problems before they grow.</h2>
            <p className="sc-body">
              LinkJoin flags repeat tardiness and chronic absence automatically
              so counselors and teachers can act early, not after the damage is done.
            </p>
            <ul className="sc-bullets">
              <li>Automatic flags for chronic absence and repeat tardiness</li>
              <li>Open a case, assign a counselor, track escalation</li>
              <li>Add notes and update status as situations evolve</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Interventions</span>
              </div>
              <div className="sc-mock-iv">
                <div className="sc-mock-iv-row">
                  <div>
                    <div className="sc-mock-iv-name">Jake Martinez</div>
                    <div className="sc-mock-iv-meta">Algebra II · Repeat tardiness</div>
                  </div>
                  <span className="sc-badge sc-badge--blue">In progress</span>
                </div>
                <div className="sc-mock-iv-note">
                  Spoke with Jake. Alarm issue, will monitor this week.
                </div>
                <div className="sc-mock-iv-row">
                  <div>
                    <div className="sc-mock-iv-name">Tyler Nguyen</div>
                    <div className="sc-mock-iv-meta">Biology · Low attendance</div>
                  </div>
                  <span className="sc-badge sc-badge--yellow">Open</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Visibility at every level */}
      <section className="sc-section">
        <div data-rid="s3" className={rc('s3', 'sc-hl')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Multi-level dashboards</span>
            <h2 className="sc-h2">Visibility at every level.</h2>
            <p className="sc-body">
              Teachers see their classes. School admins see every teacher. District
              admins see every school. Every level drills down with a click.
            </p>
            <ul className="sc-bullets">
              <li>Teacher view: per-class attendance and student history</li>
              <li>School admin view: all teachers, patterns, and open cases</li>
              <li>District admin view: all schools in one place</li>
              <li>Role-based access, so everyone sees exactly what they should</li>
            </ul>
          </div>
          <div className="sc-hl-visual sc-hl-visual--blob" style={{flexDirection:'column', gap:'8px'}}>
              <div className="sc-hier-blob" aria-hidden="true">
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                  <path fill="var(--sc-surface)" d="M48.4,-67.4C59.2,-58.8,61.8,-39.9,61.6,-23.9C61.4,-8,58.3,5,55.8,19.8C53.3,34.6,51.3,51.2,42.1,58.1C32.9,64.9,16.4,61.9,0.8,60.8C-14.8,59.7,-29.7,60.5,-41.3,54.4C-52.9,48.4,-61.2,35.5,-69,20.3C-76.8,5.2,-84.1,-12.3,-78.8,-24.7C-73.5,-37.1,-55.6,-44.4,-40.3,-51.6C-25.1,-58.7,-12.5,-65.6,3.1,-69.9C18.8,-74.3,37.7,-76,48.4,-67.4Z" transform="translate(100 100)" />
                </svg>
              </div>
              <div className="sc-mock-hier">
                <div className="sc-hier-item">
                  <div className="sc-hier-icon sc-hier-icon--district">D</div>
                  <div>
                    <div className="sc-hier-label">District admin</div>
                    <div className="sc-hier-sub">All schools · district-wide view</div>
                  </div>
                  <div className="sc-hier-line" />
                </div>
                <div className="sc-hier-spacer" />
                <div className="sc-hier-item">
                  <div className="sc-hier-icon sc-hier-icon--school">S</div>
                  <div>
                    <div className="sc-hier-label">School admin</div>
                    <div className="sc-hier-sub">All teachers · interventions · exports</div>
                  </div>
                  <div className="sc-hier-line" />
                </div>
                <div className="sc-hier-spacer" />
                <div className="sc-hier-item">
                  <div className="sc-hier-icon sc-hier-icon--teacher">T</div>
                  <div>
                    <div className="sc-hier-label">Teacher</div>
                    <div className="sc-hier-sub">Classes · students · attendance</div>
                  </div>
                </div>
              </div>
              <Link to="/schools/dashboards" className="sc-learn-more" style={{position:'relative', zIndex:2, marginTop:'-16px'}}>See how it works →</Link>
          </div>
        </div>
      </section>

      {/* Section 4: LMS integration */}
      <section className="sc-section sc-section--alt">
        <div data-rid="s4" className={rc('s4', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">LMS integration</span>
            <h2 className="sc-h2">Works with the tools you already use.</h2>
            <p className="sc-body">
              Import class schedules and rosters from your existing LMS in seconds.
              LinkJoin stays in sync automatically without manual updates or double entry.
            </p>
            <ul className="sc-bullets">
              <li>Google Classroom, Canvas, and Schoology imports</li>
              <li>Clever and ClassLink roster sync</li>
              <li>OneRoster-compatible for district-level rollouts</li>
              <li>Schedule changes reflected automatically</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-logo-grid">
              {LMS_BRANDS.map(({ name, logo }) => (
                <div key={name} className="sc-logo-pill">
                  <img src={logo} alt={name} className="sc-logo-img" />
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Family engagement */}
      <section className="sc-section">
        <div data-rid="s5" className={rc('s5', 'sc-hl')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Family engagement</span>
            <h2 className="sc-h2">Keep families in the loop.</h2>
            <p className="sc-body">
              Parents and guardians get automatic text and email reminders about
              upcoming classes, so students show up prepared and families stay
              informed without any extra work from teachers.
            </p>
            <ul className="sc-bullets">
              <li>Automated class reminders via text and email</li>
              <li>Absence and tardiness notifications to parents</li>
              <li>No app download required for families</li>
              <li>Configurable notification preferences per student</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div
              data-rid="phone"
              className={`sc-mock-phone-wrap${phoneVisible ? ' sc-phone-visible' : ' sc-phone-hidden'}`}
            >
              <div className="sc-mock-phone">
                <div className="sc-mock-phone-notch" />
                <div className="sc-mock-notif">
                  <div className="sc-mock-notif-app">LinkJoin · now</div>
                  <div className="sc-mock-notif-title">Class reminder for Emma</div>
                  <div className="sc-mock-notif-body">
                    Algebra II starts in 10 minutes. Tap to open the class link.
                  </div>
                </div>
                <div className="sc-mock-notif" style={{ marginTop: 8, opacity: 0.6 }}>
                  <div className="sc-mock-notif-app">LinkJoin · 2h ago</div>
                  <div className="sc-mock-notif-title">Absence notice: Tyler N.</div>
                  <div className="sc-mock-notif-body">
                    Tyler missed Biology today. Contact the school for details.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Student rewards */}
      <section className="sc-section sc-section--alt sc-no-wave">
        <div data-rid="s6" className={rc('s6', 'sc-hl sc-hl--flip')}>
          <div className="sc-hl-text">
            <span className="sc-eyebrow">Student rewards</span>
            <h2 className="sc-h2">Make showing up worth it.</h2>
            <p className="sc-body">
              Students earn streaks and awards for consistent on-time attendance.
              When good habits get recognized, they stick.
            </p>
            <ul className="sc-bullets">
              <li>Automatic streaks for consecutive on-time joins</li>
              <li>Awards for perfect weeks, months, and milestones</li>
              <li>Teachers can grant custom recognition</li>
              <li>Students see their own progress in real time</li>
            </ul>
          </div>
          <div className="sc-hl-visual">
            <div className="sc-mock">
              <div className="sc-mock-header">
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <div className="sc-mock-header-dot" />
                <span className="sc-mock-header-title">Emma's rewards</span>
              </div>
              <div className="sc-mock-rewards">
                <div className="sc-rewards-streak">
                  <div className="sc-streak-count">12</div>
                  <div className="sc-streak-label">day streak</div>
                </div>
                <div className="sc-awards-grid">
                  <div className="sc-award sc-award--gold">Perfect Week</div>
                  <div className="sc-award sc-award--blue">Early Bird</div>
                  <div className="sc-award sc-award--purple">10-Day Streak</div>
                  <div className="sc-award sc-award--green">Monthly Champion</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <div ref={trustRef} data-rid="trust" className={rc('trust', 'sc-trust')}>
        <span className="sc-trust-item sc-trust-item--stat">
          <span className="sc-trust-stat">{statCount.toLocaleString()}+</span>
          classes tracked
        </span>
        {[
          'FERPA compliant',
          'COPPA compliant',
          'Role-based access',
          'Data retention controls',
        ].map(item => (
          <span key={item} className="sc-trust-item">{item}</span>
        ))}
      </div>

      {/* Closing CTA */}
      <section data-rid="cta" className={rc('cta', 'sc-cta')}>
        <h2 className="sc-cta-h2">Ready to see it in action?</h2>
        <p className="sc-cta-sub">
          Set up takes minutes. We'll help you import your first class roster and
          go live the same day.
        </p>
        <div className="sc-cta-actions">
          <Link to="/signup" className="sc-btn-primary">Get started</Link>
          <a href="mailto:seth@linkjoin.xyz" className="sc-btn-ghost">Request a demo</a>
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
            <Link to="/privacy-schools">Privacy for Schools</Link>
            <Link to="/dpa">DPA</Link>
            <Link to="/subprocessors">Subprocessors</Link>
            <Link to="/breach-policy">Breach Policy</Link>
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
