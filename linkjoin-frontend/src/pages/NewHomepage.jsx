import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AuthModal from '../components/AuthModal.jsx'
import '../styles/new-homepage.css'

const FAQ_ITEMS = [
  {
    q: "Will my meeting open if I'm not at my computer?",
    a: "It depends on whether your computer is on. If it's on when the meeting is scheduled, it opens automatically. LinkJoin also sends text reminders before each meeting so you make it back in time.",
  },
  {
    q: 'Will my camera and mic turn on automatically?',
    a: "No. All platforms require you to confirm before fully joining. You won't be caught off-guard. LinkJoin just opens the meeting window at the right moment.",
  },
  {
    q: 'Why are my meetings not opening?',
    a: 'The most common cause is blocked pop-ups. Enable pop-ups for your browser and confirm the toggle on your link is blue (active). Still having trouble? Reach out at seth@linkjoin.xyz.',
  },
  {
    q: 'How do I enable pop-ups in Chrome?',
    a: 'Open Chrome Settings, go to Privacy and Security, then Site Settings, then Pop-ups and redirects, and select "Sites can send pop-ups and use redirects."',
  },
  {
    q: 'How do I enable pop-ups in Firefox?',
    a: 'Open Preferences, go to Privacy and Security, scroll to Permissions, and uncheck "Block pop-up windows."',
  },
  {
    q: 'Does LinkJoin work on mobile?',
    a: "Links won't auto-open on mobile due to OS restrictions, but you can still tap any link to open it manually. Full auto-join works on desktop.",
  },
]

const PLATFORMS = ['Zoom', 'Google Meet', 'Teams', 'Webex']

const TESTIMONIALS = [
  { quote: "I was always a few minutes late to our morning standup. Set this up on a Monday and haven't been late since.", name: 'Sarah M.', title: 'Engineering Lead' },
  { quote: "We rolled it out to the whole team. Everyone gets the same link and it just opens when it's supposed to. No more 'can you send the Zoom link?' in Slack.", name: 'James T.', title: 'Director of Operations' },
  { quote: "The Chrome extension is what sold me. Got a calendar invite, clicked add, done in ten seconds. I haven't copy-pasted a meeting link in months.", name: 'Priya N.', title: 'UX Designer' },
  { quote: "I step away from my desk a lot during the day. The text reminder means I actually make it back in time instead of realizing I missed something an hour later.", name: 'David L.', title: 'Account Executive' },
]
const BAND = '#091B30'
const BASE = '#060F1A'

function WaveDivider({ top, bottom, flip = false }) {
  const d = flip
    ? 'M0,0 H1440 V40 C1080,0 360,80 0,40 Z'
    : 'M0,0 H1440 V40 C1080,80 360,0 0,40 Z'
  return (
    <div style={{ background: bottom, lineHeight: 0, overflow: 'hidden' }}>
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none"
           style={{ display: 'block', width: '100%', height: 80 }}>
        <path d={d} fill={top} />
      </svg>
    </div>
  )
}

export default function NewHomepage() {
  const { token } = useAuth()
  const [authModal, setAuthModal] = useState(null)
  const [openFaq, setOpenFaq] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [visSet, setVisSet] = useState(() => new Set())
  const howRef = useRef(null)
  const curveRef = useRef(null)
  const carouselRef = useRef(null)

  function scrollTestimonials(dir) {
    const el = carouselRef.current
    if (!el) return
    const card = el.querySelector('.nh-testimonial')
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 20), behavior: 'smooth' })
  }

  // Compact nav on scroll
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Scroll-reveal — stores visibility in React state so it survives re-renders
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
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    )
    document.querySelectorAll('[data-rid]').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // Blur the SVG curve as user scrolls past the hero (mirrors original homepage)
  useEffect(() => {
    const handler = () => {
      const pct = Math.min(window.scrollY / window.innerHeight, 1)
      if (curveRef.current) {
        curveRef.current.style.filter = `blur(${pct * 30}px)`
        curveRef.current.style.opacity = 1 - pct * 0.75
      }
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Helper: builds className with reveal state included
  const rc = (id, base = '') =>
    [base, 'nh-reveal', visSet.has(id) ? 'nh-visible' : ''].filter(Boolean).join(' ')

  return (
    <div className="nh-root">

      {/* Ambient background */}
      <div className="nh-bg" aria-hidden="true">
        <svg ref={curveRef} className="nh-curve" viewBox="0 0 500 500" preserveAspectRatio="xMinYMin meet">
          <path d="m 235,0 c 65,200 -85,100 115,600 L 0.75595238,600.1131 0,0 Z" />
        </svg>
      </div>

      {/* Navigation */}
      <nav className={`nh-nav${scrolled ? ' nh-nav-compact' : ''}`}>
        <Link to="/" className="nh-nav-logo">
          <img src="/images/logo-text.svg" height="32" alt="LinkJoin" />
        </Link>

        <div className="nh-nav-links">
          <Link to="/meetings">Meetings</Link>
          <Link to="/bookmarks">Bookmarks</Link>
          <Link to="/pricing">Pricing</Link>
        </div>

        <div className="nh-nav-right">
          <div className="nh-nav-actions">
            {token ? (
              <Link to="/meetings" className="nh-btn-primary">
                Dashboard <img src="/images/arrow-right.svg" height="14" width="14" alt="" />
              </Link>
            ) : (
              <>
                <button className="nh-btn-ghost nh-nav-login" onClick={() => setAuthModal('login')}>Log In</button>
                <button className="nh-btn-primary nh-nav-cta" onClick={() => setAuthModal('signup')}>
                  Get started <img src="/images/arrow-right.svg" height="14" width="14" alt="" />
                </button>
              </>
            )}
          </div>

          <button
            className={`nh-hamburger${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen(m => !m)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
        </div>

        {menuOpen && (
          <div className="nh-mobile-menu">
            <button className="nh-menu-login" onClick={() => { setMenuOpen(false); setAuthModal('login') }}>Log In</button>
            <button className="nh-menu-cta" onClick={() => { setMenuOpen(false); setAuthModal('signup') }}>Sign Up</button>
            <Link to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
            <Link to="/bookmarks" onClick={() => setMenuOpen(false)}>Bookmarks</Link>
            <Link to="/meetings" onClick={() => setMenuOpen(false)}>Meetings</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="nh-hero">
        <div className="nh-hero-left">
          <h1 className="nh-hero-h1 nh-anim-1">
            Meetings that<br />
            <span className="nh-hero-accent">open themselves.</span>
          </h1>

          <p className="nh-hero-sub nh-anim-2">
            LinkJoin automatically opens your meetings at exactly the right time. You never have to lift a finger.
          </p>

          <div className="nh-hero-actions nh-anim-3">
            <button className="nh-btn-primary nh-btn-lg nh-desktop-only" onClick={() => setAuthModal('signup')}>
              Get started for free
            </button>
            <a
              href="https://chromewebstore.google.com/detail/add-to-linkjoin/mhncphjlaeeglmjpgdmclklebdfomele"
              target="_blank" rel="noreferrer"
              className="nh-btn-ghost nh-btn-lg nh-desktop-only"
            >
              <img src="/images/logos/chrome-logo.svg" height="20" width="20" alt="" />
              Add to Chrome
            </a>
            <button className="nh-btn-primary nh-btn-white nh-btn-lg nh-mobile-only" onClick={() => setAuthModal('signup')}>
              <img src="/images/logos/google.svg" height="18" width="18" alt="" />
              Sign up with Google
            </button>
            <button className="nh-btn-primary nh-btn-lg nh-mobile-only" onClick={() => setAuthModal('login')}>
              Sign up with email
            </button>
          </div>

          <div className="nh-platforms nh-anim-4">
            {PLATFORMS.map(p => (
              <span key={p} className="nh-platform-pill">{p}</span>
            ))}
            <span className="nh-platform-pill nh-platform-pill-more">and more...</span>
          </div>
        </div>

        <div className="nh-hero-right nh-anim-visual">
          <img
            src="/images/calendar_guy.svg"
            className="nh-hero-illustration"
            alt="Person surrounded by meeting calendars"
          />
        </div>
      </section>

      {/* Stats strip */}
      <div data-rid="stats" className={rc('stats', 'nh-stats-strip')}>
        <div className="nh-stat">
          <span className="nh-stat-num">2,000+</span>
          <span className="nh-stat-label">Active users</span>
        </div>
        <div className="nh-stat-divider" />
        <div className="nh-stat">
          <span className="nh-stat-num">50K+</span>
          <span className="nh-stat-label">Meetings opened</span>
        </div>
        <div className="nh-stat-divider" />
        <div className="nh-stat">
          <span className="nh-stat-num">0</span>
          <span className="nh-stat-label">Clicks needed</span>
        </div>
        <div className="nh-stat-divider" />
        <div className="nh-stat">
          <span className="nh-stat-num">4+</span>
          <span className="nh-stat-label">Platforms supported</span>
        </div>
      </div>

      {/* How it works */}
      <section className="nh-how" ref={howRef}>
        <h2 data-rid="how-h2" className={rc('how-h2', 'nh-section-h2')}>
          Three steps.<br />One less thing to think about.
        </h2>

        <div className="nh-steps">
          {[
            { n: '1', title: 'Add your link', body: 'Paste any meeting URL: Zoom, Google Meet, Teams, Webex, and more.' },
            { n: '2', title: 'Set the time', body: 'Choose when the meeting starts. Recurring? Set it once.' },
            { n: '3', title: 'Show up', body: 'Your meeting opens automatically. Just sit down and join.' },
          ].map((s, i) => (
            <div
              key={s.n}
              data-rid={`step-${s.n}`}
              className={rc(`step-${s.n}`, 'nh-step')}
              style={{ '--delay': `${i * 100}ms` }}
            >
              <div className="nh-step-num">{s.n}</div>
              {i < 2 && <div className="nh-step-line" />}
              <h3 className="nh-step-title">{s.title}</h3>
              <p className="nh-step-body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature highlights */}
      <WaveDivider top={BASE} bottom={BAND} />
      <section className="nh-highlights">

        {/* 1: Recurring meetings */}
        <div data-rid="hl-b" className={rc('hl-b', 'nh-highlight nh-hl-band')}>
          <div className="nh-hl-inner">
          <div className="nh-hl-text">
            <p className="nh-hl-eyebrow">Recurring Meetings</p>
            <h3 className="nh-hl-h3">Set it once. Never miss again.</h3>
            <p className="nh-hl-body">
              Add a recurring meeting and LinkJoin opens it automatically every week, every
              two weeks, every month, or whatever the schedule calls for. No re-entering, no
              copy-pasting, no forgetting.
            </p>
            <ul className="nh-hl-bullets">
              <li>Weekly, biweekly, and monthly schedules</li>
              <li>One-time meetings supported</li>
              <li>Toggle any meeting on or off instantly</li>
            </ul>
          </div>
          <div className="nh-hl-visual">
            <div className="nh-mock-calendar">
              <div className="nh-mock-cal-month">June 2025</div>
              <div className="nh-mock-cal-head">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => <span key={d}>{d}</span>)}
              </div>
              {[
                { week: [2,3,4,5,6], active: [0] },
                { week: [9,10,11,12,13], active: [0,2] },
                { week: [16,17,18,19,20], active: [0] },
                { week: [23,24,25,26,27], active: [0,2] },
              ].map(({ week, active }, wi) => (
                <div key={wi} className="nh-mock-cal-row">
                  {week.map((day, di) => (
                    <div key={day} className={`nh-mock-cal-cell${active.includes(di) ? ' nh-cal-active' : ''}`}>
                      <span className="nh-mock-cal-num">{day}</span>
                      {active.includes(di) && <span className="nh-cal-dot" style={di === 2 ? { background: '#3ecf8e' } : {}} />}
                    </div>
                  ))}
                </div>
              ))}
              <div className="nh-mock-cal-legends">
                <span className="nh-mock-cal-legend"><span className="nh-cal-dot" /> Weekly standup</span>
                <span className="nh-mock-cal-legend"><span className="nh-cal-dot" style={{ background: '#3ecf8e' }} /> Design review</span>
              </div>
            </div>
          </div>
          </div>
        </div>

        <WaveDivider top={BAND} bottom={BASE} flip />

        {/* 2: Gmail auto-detect */}
        <div data-rid="hl-a" className={rc('hl-a', 'nh-highlight nh-hl-flip')}>
          <div className="nh-hl-inner">
          <div className="nh-hl-text">
            <p className="nh-hl-eyebrow">Chrome Extension</p>
            <h3 className="nh-hl-h3">Your inbox reads ahead.</h3>
            <p className="nh-hl-body">
              Open an email with a meeting link and LinkJoin's Chrome extension detects it
              instantly. It reads the subject, time, and recurrence from the invite and
              pre-fills everything, so you just confirm and move on.
            </p>
            <ul className="nh-hl-bullets">
              <li>Works with Zoom, Meet, Teams, and Webex invites</li>
              <li>Reads time, recurrence, and meeting name automatically</li>
              <li>Skips meetings already in your LinkJoin</li>
            </ul>
            <a
              href="https://chromewebstore.google.com/detail/add-to-linkjoin/mhncphjlaeeglmjpgdmclklebdfomele"
              target="_blank" rel="noreferrer"
              className="nh-hl-link"
            >
              <img src="/images/logos/chrome-logo.svg" height="16" width="16" alt="" />
              Add to Chrome
            </a>
          </div>
          <div className="nh-hl-visual">
            <div className="nh-mock-email-ctx">
              <div className="nh-mock-email-strip">
                <span className="nh-mock-email-from">calendar-noreply@google.com</span>
                <span className="nh-mock-email-subj">Team standup @ Mon 9am (PDT)</span>
                <span className="nh-mock-email-body">You have been invited to a recurring Google Meet video call. Join at meet.google.com/abc-xyz-def every Monday at 9am Pacific.</span>
              </div>
              <div className="nh-mock-overlay">
                <div className="nh-mock-ov-header">
                  <span className="nh-mock-ov-title">LinkJoin</span>
                  <span className="nh-mock-ov-badge">Meeting detected</span>
                </div>
                <div className="nh-mock-ov-body">
                  <span className="nh-mock-ov-label">Name</span>
                  <div className="nh-mock-ov-field">Team standup</div>
                  <span className="nh-mock-ov-label">Days</span>
                  <div className="nh-mock-ov-days">
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <span key={i} className={`nh-mock-day${i === 1 ? ' active' : ''}`}>{d}</span>
                    ))}
                  </div>
                  <span className="nh-mock-ov-label">Time</span>
                  <div className="nh-mock-ov-field">9:00 AM</div>
                  <span className="nh-mock-ov-label">Repeats</span>
                  <div className="nh-mock-ov-field">Every week</div>
                  <button className="nh-mock-ov-btn">Add to LinkJoin</button>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        <WaveDivider top={BASE} bottom={BAND} />

        {/* 3: Shared links */}
        <div data-rid="hl-c" className={rc('hl-c', 'nh-highlight nh-hl-band')}>
          <div className="nh-hl-inner">
          <div className="nh-hl-text">
            <p className="nh-hl-eyebrow">Team Sharing</p>
            <h3 className="nh-hl-h3">One link for your whole team.</h3>
            <p className="nh-hl-body">
              Share a LinkJoin link so every participant gets the same auto-open experience.
              When the meeting starts, everyone's browser opens it at once.
            </p>
            <ul className="nh-hl-bullets">
              <li>No waiting for late attendees</li>
              <li>Works across any meeting platform</li>
              <li>Accessible to users without an account</li>
            </ul>
          </div>
          <div className="nh-hl-visual">
            <div className="nh-mock-share">
              <div className="nh-mock-share-url">
                <span className="nh-mock-share-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </span>
                <span>linkjoin.xyz/s/standup</span>
              </div>
              <div className="nh-mock-share-members">
                <div className="nh-mock-avatars">
                  {[['AK', '#1a4a70'], ['BR', '#0d3050'], ['CL', '#2B8FD8']].map(([l, bg]) => (
                    <div key={l} className="nh-mock-avatar" style={{ background: bg }}>{l}</div>
                  ))}
                </div>
                <div className="nh-mock-share-names">3 members</div>
              </div>
              <div className="nh-mock-share-rows">
                {[['AK', 'Alex K.'], ['BR', 'Beth R.'], ['CL', 'Chris L.']].map(([i, name]) => (
                  <div key={i} className="nh-mock-share-row">
                    <div className="nh-mock-share-row-avatar">{i}</div>
                    <span className="nh-mock-share-row-name">{name}</span>
                    <span className="nh-mock-share-check">✓</span>
                    <span className="nh-mock-share-status">Joined on time</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>
        </div>

        <WaveDivider top={BAND} bottom={BASE} flip />

        {/* 4: SMS reminders */}
        <div data-rid="hl-d" className={rc('hl-d', 'nh-highlight nh-hl-flip')}>
          <div className="nh-hl-inner">
          <div className="nh-hl-text">
            <p className="nh-hl-eyebrow">Text Reminders</p>
            <h3 className="nh-hl-h3">A nudge before you need one.</h3>
            <p className="nh-hl-body">
              Get a text message before each meeting starts. Step away from your desk,
              grab a coffee, take a call, and LinkJoin makes sure you make it back in time.
            </p>
            <ul className="nh-hl-bullets">
              <li>Choose your lead time: 5, 10, 15, 30, or 60 minutes</li>
              <li>Per-meeting reminder settings</li>
              <li>Works even when your computer is closed</li>
            </ul>
          </div>
          <div className="nh-hl-visual">
            <div className="nh-mock-phone">
              <div className="nh-mock-phone-bar">
                <span>9:41</span>
                <span className="nh-mock-phone-icons">
                  <svg width="14" height="10" viewBox="0 0 24 16" fill="currentColor"><rect x="0" y="4" width="4" height="12" rx="1"/><rect x="6" y="2" width="4" height="14" rx="1"/><rect x="12" y="0" width="4" height="16" rx="1"/><rect x="18" y="0" width="4" height="16" rx="1" opacity=".3"/></svg>
                </span>
              </div>
              <div className="nh-mock-sms-thread">
                <div className="nh-mock-sms-sender">Messages · LinkJoin</div>
                <div className="nh-mock-sms-bubble">
                  ⏰ Your meeting <strong>Team standup</strong> starts in 15 minutes.
                </div>
                <div className="nh-mock-sms-bubble">
                  ⏰ <strong>Design review</strong> starts in 10 minutes. Head back to your desk.
                </div>
                <div className="nh-mock-sms-bubble nh-mock-sms-recent">
                  ⏰ <strong>1:1 with manager</strong> starts in 5 minutes.
                </div>
                <div className="nh-mock-sms-time">Just now</div>
              </div>
            </div>
          </div>
          </div>
        </div>

        <WaveDivider top={BASE} bottom={BAND} />

        {/* 5: Calendar import */}
        <div data-rid="hl-e" className={rc('hl-e', 'nh-highlight nh-hl-band')}>
          <div className="nh-hl-inner">
          <div className="nh-hl-text">
            <p className="nh-hl-eyebrow">Calendar Import</p>
            <h3 className="nh-hl-h3">Already have a calendar? Use it.</h3>
            <p className="nh-hl-body">
              Connect Google Calendar or Outlook and pull your recurring meetings straight into
              LinkJoin. It reads the time, recurrence, and meeting link, while you just pick which
              ones to add.
            </p>
            <ul className="nh-hl-bullets">
              <li>Google Calendar and Outlook / Microsoft 365</li>
              <li>Filters to show only video meetings</li>
              <li>Skips anything already in your LinkJoin</li>
            </ul>
          </div>
          <div className="nh-hl-visual">
            <div className="nh-mock-cal-import">
              <div className="nh-mock-cal-import-header">
                <span className="nh-mock-cal-import-title">Import calendar</span>
                <div className="nh-mock-cal-import-provider">
                  <span className="nh-mock-cal-import-tab active">Google</span>
                  <span className="nh-mock-cal-import-tab">Outlook</span>
                </div>
              </div>
              <div className="nh-mock-cal-import-list">
                {[
                  { name: 'Team standup', meta: 'Mon 9:00 AM · Weekly', color: '#4285F4', label: 'Meet' },
                  { name: 'Design review', meta: 'Wed 2:00 PM · Weekly', color: '#2D8CFF', label: 'Zoom' },
                  { name: '1:1 with manager', meta: 'Fri 11:00 AM · Weekly', color: '#6264A7', label: 'Teams' },
                ].map((e, i) => (
                  <div key={i} className="nh-mock-cal-import-row">
                    <div className="nh-mock-cal-import-check">
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="nh-mock-cal-import-info">
                      <span className="nh-mock-cal-import-name">{e.name}</span>
                      <span className="nh-mock-cal-import-meta">{e.meta}</span>
                    </div>
                    <span
                      className="nh-mock-cal-import-plat"
                      style={{ background: `${e.color}22`, color: e.color }}
                    >
                      {e.label}
                    </span>
                  </div>
                ))}
              </div>
              <button className="nh-mock-cal-import-btn">Import 3 meetings</button>
            </div>
          </div>
          </div>
        </div>

        <WaveDivider top={BAND} bottom={BASE} flip />

      </section>

      {/* Testimonials */}
      <section className="nh-testimonials">
        <div className="nh-testimonials-head">
          <p data-rid="t-label" className={rc('t-label', 'nh-section-label')}>What people say</p>
          <div className="nh-tcar-arrows">
            <button className="nh-tcar-btn" onClick={() => scrollTestimonials(-1)} aria-label="Previous">‹</button>
            <button className="nh-tcar-btn" onClick={() => scrollTestimonials(1)} aria-label="Next">›</button>
          </div>
        </div>
        <div className="nh-tcarousel" ref={carouselRef}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="nh-testimonial">
              <p className="nh-testimonial-quote">"{t.quote}"</p>
              <div className="nh-testimonial-attr">
                <span className="nh-testimonial-name">{t.name}</span>
                <span className="nh-testimonial-title">{t.title}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="nh-faq">
        <div data-rid="faq-left" className={rc('faq-left', 'nh-faq-left')}>
          <h2 className="nh-faq-h2">Got questions?<br />We've got answers.</h2>
          <p className="nh-faq-sub">
            Anything else? Email us at{' '}
            <a href="mailto:seth@linkjoin.xyz" className="nh-link">seth@linkjoin.xyz</a>
          </p>
        </div>

        <div className="nh-faq-right">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              data-rid={`faq-${i}`}
              className={[
                rc(`faq-${i}`, 'nh-faq-item'),
                openFaq === i ? 'open' : '',
              ].filter(Boolean).join(' ')}
              style={{ '--delay': `${i * 40}ms` }}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="nh-faq-question">
                <span>{item.q}</span>
                <img
                  src="/images/angle-down.svg"
                  className="nh-faq-chevron"
                  height="20" width="20" alt=""
                />
              </div>
              <div className="nh-faq-answer">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section data-rid="cta" className={rc('cta', 'nh-cta')}>
        <div className="nh-cta-glow" aria-hidden="true" />
        <h2 className="nh-cta-h2">Stop being late.<br />Start on time, today.</h2>
        <p className="nh-cta-sub">Free to start. No credit card required.</p>
        <div className="nh-cta-actions">
          <button className="nh-btn-primary nh-btn-lg" onClick={() => setAuthModal('signup')}>
            Create free account
            <img src="/images/arrow-right.svg" height="18" width="18" alt="" />
          </button>
          <button className="nh-btn-ghost nh-btn-lg" onClick={() => setAuthModal('login')}>
            Sign in
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="nh-footer">
        <div className="nh-footer-brand">
          <img src="/images/logo-text.svg" height="28" alt="LinkJoin" />
          <p>Always on time.</p>
        </div>

        <div className="nh-footer-cols">
          <div className="nh-footer-col">
            <p className="nh-footer-col-title">Product</p>
            <Link to="/meetings">Meetings</Link>
            <Link to="/bookmarks">Bookmarks</Link>
            <Link to="/pricing">Pricing</Link>
          </div>
          <div className="nh-footer-col">
            <p className="nh-footer-col-title">Account</p>
            <button onClick={() => setAuthModal('login')}>Log In</button>
            <button onClick={() => setAuthModal('signup')}>Sign Up</button>
          </div>
          <div className="nh-footer-col">
            <p className="nh-footer-col-title">Company</p>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/tos">Terms of Service</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>

        <div className="nh-footer-bottom">
          <span>© {new Date().getFullYear()} LinkJoin. All rights reserved.</span>
          <a href="https://storyset.com" target="_blank" rel="noreferrer" className="nh-footer-attribution">Graphics by Storyset</a>
        </div>
      </footer>

      {authModal && (
        <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />
      )}
    </div>
  )
}
