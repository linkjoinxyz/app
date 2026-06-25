import { useRef, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AuthModal from '../components/AuthModal.jsx'
import '../styles/home.css'

const FAQ_ITEMS = [
  {
    q: 'Will my meeting open if I\'m not at my computer?',
    a: (<>
      <p>It depends.</p> If your computer is off or asleep, then your meeting will not open. But if your
      computer is turned on when the meeting is scheduled to open, it will start on its own. To
      help with this, LinkJoin sends text reminders before your meeting.
    </>)
  },
  {
    q: 'Will my camera/mic turn on automatically?',
    a: (<>
      <p>No.</p> All meeting platforms require confirmation before fully entering the meeting.
      In web-based systems, you do not enter the meeting at all without confirming, and
      desktop-based systems require confirmation before enabling your microphone and camera.
      Rest assured, you won't be caught off guard.
    </>)
  },
  {
    q: 'Why are my meetings not opening?',
    a: (<>
      The most common reason is popups being disabled. To enable popups in your browser, see
      the FAQ questions below. If popups are enabled and your meeting is still not opening,
      check that the switch on your link is flipped to blue. If you continue experiencing
      difficulties, please contact support at <p>seth@linkjoin.xyz</p>.
    </>)
  },
  {
    q: 'How do I enable pop-ups in Google Chrome?',
    a: (<>
      Start by opening Chrome settings by clicking the three dots in the upper right. Select{' '}
      <p>Settings</p> and navigate to the <p>Privacy and security</p> tab. Select{' '}
      <p>Site settings</p>, scroll down, and click <p>Pop-ups and redirects</p>. At the top,
      select <p>Sites can send pop-ups and use redirects</p>, and you're good to go!
    </>)
  },
  {
    q: 'How do I enable popups in Firefox?',
    a: (<>
      Click the hamburger menu at the top right and select <p>Preferences</p>. Navigate to the{' '}
      <p>Privacy &amp; Security</p> tab, scroll down to the Permissions section, and uncheck{' '}
      <p>Block pop-up windows</p>. You're all set!
    </>)
  },
  {
    q: 'How do I enable popups in Safari?',
    a: (<>
      Press ⌘, to open Safari settings. Click the <p>Websites</p> tab at the top, scroll down
      to <p>Pop-up windows</p> on the left, then change{' '}
      <p>When visiting other websites</p> to <p>Allow</p>.
    </>)
  },
  {
    q: 'Does LinkJoin work on mobile?',
    a: (<>
      Due to restrictions on mobile devices, links will <p>not</p> automatically open on mobile.
      However, your links are still fully accessible and can be opened by clicking on them.
    </>)
  },
]

export default function Home() {
  const { token } = useAuth()
  const scrollRef = useRef(null)
  const curveRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)
  const [authModal, setAuthModal] = useState(null) // 'login' | 'signup' | null

  // Blur/fade the SVG curve as the user scrolls past the hero
  const handleScroll = useCallback(() => {
    const y = window.scrollY
    const heroH = window.innerHeight
    const pct = Math.min(y / heroH, 1)
    const blur = pct * 30      // max 30px blur
    const opacity = 1 - pct * 0.75  // fade from 1 → 0.25
    if (curveRef.current) {
      curveRef.current.style.filter = `blur(${blur}px)`
      curveRef.current.style.opacity = opacity
    }
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  function toggleFaq(i) {
    setOpenFaq(prev => (prev === i ? null : i))
  }

  return (
    <div className="home-root">
      {/* SVG curve – fixed background, blurs on scroll */}
      <svg
        ref={curveRef}
        className="home-curve"
        viewBox="0 0 500 500"
        preserveAspectRatio="xMinYMin meet"
        aria-hidden="true"
      >
        <path d="m 235,0 c 65,200 -85,100 115,600 L 0.75595238,600.1131 0,0 Z" />
      </svg>

      {/* ── Header ── */}
      <header className="home-header">
        <img src="/images/logo-text.svg" className="home-logo" height="40" alt="LinkJoin" />

        <nav className="home-nav">
          <Link to="/meetings">Meetings</Link>
          <Link to="/bookmarks">Bookmarks</Link>
          <Link to="/pricing">Pricing</Link>
          {token ? (
            <Link to="/meetings" className="home-login-btn">
              Dashboard <img src="/images/right-angle.svg" height="12" width="8" alt="" />
            </Link>
          ) : (
            <>
              <button className="home-nav-plain-btn" onClick={() => setAuthModal('signup')}>Sign Up</button>
              <button className="home-login-btn" onClick={() => setAuthModal('login')}>
                Log In <img src="/images/right-angle.svg" height="12" width="8" alt="" />
              </button>
            </>
          )}
        </nav>

        <div className="home-hamburger">
          <input
            type="checkbox"
            checked={menuOpen}
            onChange={e => setMenuOpen(e.target.checked)}
          />
          <span /><span /><span />
          <div className="home-hamburger-dropdown">
            <button className="home-hamburger-link" onClick={() => { setMenuOpen(false); setAuthModal('login') }}>Log In</button>
            <hr style={{ opacity: 0.1, width: '90%', margin: '2px 0' }} />
            <button className="home-hamburger-link" onClick={() => { setMenuOpen(false); setAuthModal('signup') }}>Sign Up</button>
            <hr style={{ opacity: 0.1, width: '90%', margin: '2px 0' }} />
            <Link to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
            <hr style={{ opacity: 0.1, width: '90%', margin: '2px 0' }} />
            <Link to="/bookmarks" onClick={() => setMenuOpen(false)}>Bookmarks</Link>
            <hr style={{ opacity: 0.1, width: '90%', margin: '2px 0' }} />
            <Link to="/meetings" onClick={() => setMenuOpen(false)}>Meetings</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="home-hero">
        <div className="home-hero-left">
          <h1 id="motto">Always On Time.</h1>
          <h4 id="description">
            LinkJoin helps you join meetings at exactly the right time, even when you forget.
          </h4>

          <button className="home-cta-btn" id="get_started" onClick={() => setAuthModal('signup')}>
            Get started for free!{' '}
            <img src="/images/arrow-right.svg" width="25" height="25" alt="" />
          </button>

          <a
            href="https://chromewebstore.google.com/detail/add-to-linkjoin/mhncphjlaeeglmjpgdmclklebdfomele"
            target="_blank"
            rel="noreferrer"
          >
            <button className="home-cta-btn secondary" id="get_it_on_chrome">
              <img src="/images/logos/chrome-logo.svg" alt="" style={{ height: 28, width: 28 }} />
              Add to Chrome
            </button>
          </a>

          <button
            className="home-cta-btn secondary"
            id="learn_more"
            onClick={() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            Learn more{' '}
            <img src="/images/arrow-down.svg" width="25" height="25" alt="" />
          </button>
        </div>

        <div className="home-hero-right">
          <img src="/images/calendar_guy.svg" alt="Man surrounded by calendars" />
        </div>
      </div>

      {/* scroll anchor */}
      <div ref={scrollRef} style={{ height: 20 }} />

      {/* ── Streamlines section ── */}
      <div className="home-what">
        <h1>LinkJoin streamlines meetings</h1>
        <p className="home-description">
          LinkJoin keeps track of your meeting links and times so you don&apos;t have to.
          When your meeting starts, LinkJoin will open it automatically.
        </p>

        <button className="home-big-btn" onClick={() => setAuthModal('signup')}>
          Try LinkJoin now{' '}
          <img src="/images/arrow-right.svg" width="25" height="25" alt="" />
        </button>

        <img
          alt="down arrows"
          className="home-down-arrow"
          src="/images/arrows-down.svg"
          onClick={() => document.getElementById('info-boxes')?.scrollIntoView({ behavior: 'smooth' })}
        />

        <div id="info-boxes">
          <div className="info-box">
            <img src="/images/mouse-pointer.svg" className="info-image" alt="" />
            <h2>Auto-join Meetings</h2>
            <p>
              Meetings open automatically right on time, taking away the anxiety of being late.
            </p>
          </div>
          <div className="info-box">
            <img src="/images/paper-plane.svg" className="info-image" alt="" />
            <h2>Share Links</h2>
            <p>
              Share scheduled meetings to ensure that all participants get there on time.
            </p>
          </div>
          <div className="info-box">
            <img src="/images/mobile-phone.svg" className="info-image" alt="" />
            <h2>Receive Reminders</h2>
            <p>
              Get a text reminder before your meeting, so you get back to your computer on time.
            </p>
          </div>
        </div>
      </div>

      {/* scroll to FAQ arrow */}
      <img
        alt="down arrows"
        className="home-down-arrow"
        style={{ position: 'relative', zIndex: 1 }}
        src="/images/arrows-down.svg"
        onClick={() => document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {/* ── FAQ ── */}
      <div className="home-faq-section" id="faq-section">
        <div className="home-faq-intro">
          <h1>More questions?</h1>
        </div>
        <div id="faq">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`faq-question${openFaq === i ? ' faq-open' : ''}`}
              onClick={() => toggleFaq(i)}
            >
              <img className="faq-down" src="/images/angle-down.svg" alt="" />
              <p>{item.q}</p>
              <div className="faq-answer">{item.a}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="footer-logo">
          <img src="/images/logo-text.svg" alt="LinkJoin Logo" />
          <p>Always on time.</p>
        </div>
        <div className="column-container">
          <div className="footer-column">
            <p className="title">Contact</p>
            <a href="mailto:seth@linkjoin.xyz">seth@linkjoin.xyz</a>
            <p style={{ margin: 0 }}>(925) 360-3457</p>
          </div>
          <div className="footer-column">
            <p className="title">Pages</p>
            <button className="home-footer-link-btn" onClick={() => setAuthModal('login')}>Login</button>
            <button className="home-footer-link-btn" onClick={() => setAuthModal('signup')}>Signup</button>
            <Link to="/pricing">Pricing</Link>
            <Link to="/meetings">Meetings</Link>
            <Link to="/bookmarks">Bookmarks</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </div>
        </div>
        <div className="copyright">
          <hr />
          <p>© Copyright {new Date().getFullYear()} LinkJoin. All rights reserved.</p>
        </div>
      </footer>

      {authModal && (
        <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />
      )}
    </div>
  )
}
