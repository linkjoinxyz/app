import { Link } from 'react-router-dom'
import NhNav from '../components/NhNav.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/new-homepage.css'

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/add-to-linkjoin/mhncphjlaeeglmjpgdmclklebdfomele'

const BAND = '#091B30'
const BASE = '#060F1A'

function WaveDivider({ top, bottom, flip = false }) {
  const d = flip
    ? 'M0,40 C360,0 1080,80 1440,40 V82 H0 Z'
    : 'M0,40 C360,80 1080,0 1440,40 V82 H0 Z'
  return (
    <div style={{ background: top, lineHeight: 0, overflow: 'hidden' }}>
      <svg viewBox="0 0 1440 82" preserveAspectRatio="none"
           style={{ display: 'block', width: '100%', height: 80 }}>
        <rect width="1440" height="82" fill={top} />
        <path d={d} fill={bottom} />
      </svg>
    </div>
  )
}

function AddToChromeButton() {
  return (
    <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer" className="ext-chrome-btn">
      <span className="ext-chrome-btn-icon">
        <img src="/images/logos/chrome-logo.svg" height="28" width="28" alt="" />
      </span>
      Add to Chrome
    </a>
  )
}

export default function Extension() {
  return (
    <div className="nh-root">
      <NhNav />

      <section className="ext-hero">
        <p className="nh-hl-eyebrow ext-hero-eyebrow">Chrome Extension</p>
        <h1 className="ext-hero-h1">Never miss a meeting again.</h1>
        <p className="ext-hero-sub">
          Meetings open themselves, invites schedule themselves, and IT can roll it out to an
          entire school in minutes. Install once and stop thinking about it.
        </p>
        <div className="ext-hero-actions">
          <AddToChromeButton />
        </div>
      </section>

      <WaveDivider top={BASE} bottom={BAND} />
      <section className="nh-highlights">

        {/* 1: Auto-open + actionable notifications + badge */}
        <div className="nh-highlight nh-hl-band">
          <div className="nh-hl-inner">
            <div className="nh-hl-text">
              <p className="nh-hl-eyebrow">Show up, every time</p>
              <h3 className="nh-hl-h3">Your meetings open themselves. You just show up.</h3>
              <p className="nh-hl-body">
                The moment your Zoom, Meet, or Teams meeting starts, LinkJoin opens it for you.
                No digging through email, no frantic bookmark search. Running a couple minutes
                behind? A quick heads-up lets you jump in or skip today with one click.
              </p>
              <ul className="nh-hl-bullets">
                <li>Opens automatically, right on the scheduled second</li>
                <li>One-click Join now or Skip today from the reminder</li>
                <li>A toolbar badge shows exactly how many meetings are left today</li>
              </ul>
            </div>
            <div className="nh-hl-visual">
              <div className="ext-mock-notify-stack">
                <div className="ext-mock-notify">
                  <div className="ext-mock-notify-head">
                    <img src="/images/logo-rounded.png" width="18" height="18" alt="" />
                    <span>Meeting starting in 2 minutes</span>
                  </div>
                  <p className="ext-mock-notify-body">Team standup is about to start</p>
                  <div className="ext-mock-notify-btns">
                    <span className="ext-mock-notify-btn ext-mock-notify-btn-primary">Join now</span>
                    <span className="ext-mock-notify-btn">Skip today</span>
                  </div>
                </div>
                <div className="ext-mock-toolbar">
                  <div className="ext-mock-toolbar-icon">
                    <img src="/images/logo-rounded.png" width="20" height="20" alt="" />
                    <span className="ext-mock-toolbar-badge">2</span>
                  </div>
                  <span className="ext-mock-toolbar-label">2 meetings left today</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <WaveDivider top={BAND} bottom={BASE} flip />

        {/* 2: Gmail / Outlook detection */}
        <div className="nh-highlight nh-hl-flip">
          <div className="nh-hl-inner">
            <div className="nh-hl-text">
              <p className="nh-hl-eyebrow">Your inbox is already scheduling</p>
              <h3 className="nh-hl-h3">Found a meeting link? LinkJoin already saw it.</h3>
              <p className="nh-hl-body">
                Open a Zoom, Meet, or Teams invite in Gmail or Outlook and LinkJoin quietly flags
                it, ready to add in a single click.
                Upgrade to Premium and AI reads the whole email for you, filling in the day, time,
                and repeat pattern automatically.
              </p>
              <ul className="nh-hl-bullets">
                <li>Works automatically inside Gmail and Outlook</li>
                <li>Add a detected meeting in one click</li>
                <li>Premium: AI fills in the day, time, and repeat pattern for you</li>
              </ul>
              <Link to="/pricing" className="nh-hl-link">
                See Premium features
                <span>&#8594;</span>
              </Link>
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

        {/* 3: Right-click to schedule */}
        <div className="nh-highlight nh-hl-band">
          <div className="nh-hl-inner">
            <div className="nh-hl-text">
              <p className="nh-hl-eyebrow">Schedule from anywhere</p>
              <h3 className="nh-hl-h3">One right-click. Meeting scheduled.</h3>
              <p className="nh-hl-body">
                See a meeting link anywhere on the web? Right-click it, choose Add to LinkJoin, and
                you land straight in a scheduling form with the link already filled in. Rather save
                it for later? Bookmark this link is still one click away.
              </p>
              <ul className="nh-hl-bullets">
                <li>Works on any link, on any page</li>
                <li>Jumps straight into a pre-filled scheduling form</li>
                <li>Bookmark this link for a quick save instead</li>
              </ul>
            </div>
            <div className="nh-hl-visual">
              <div className="ext-mock-ctxmenu-wrap">
                <div className="ext-mock-ctxmenu-link">zoom.us/j/8829104455</div>
                <div className="ext-mock-ctxmenu">
                  <div className="ext-mock-ctxmenu-item ext-mock-ctxmenu-item-hi">Add to LinkJoin</div>
                  <div className="ext-mock-ctxmenu-item">Bookmark this link</div>
                  <div className="ext-mock-ctxmenu-sep" />
                  <div className="ext-mock-ctxmenu-item ext-mock-ctxmenu-item-dim">Copy link address</div>
                  <div className="ext-mock-ctxmenu-item ext-mock-ctxmenu-item-dim">Inspect</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <WaveDivider top={BAND} bottom={BASE} flip />
      </section>

      <section className="nh-features ext-schools">
        <div className="ext-schools-head">
          <p className="nh-hl-eyebrow ext-hero-eyebrow">For schools &amp; districts</p>
          <h2 className="nh-section-h2">One click for IT. Zero clicks for students.</h2>
        </div>
        <div className="nh-features-grid ext-schools-grid">
          <div className="nh-feature-card ext-feature-card">
            <h3 className="nh-feature-title">Zero-touch sign-in</h3>
            <p className="nh-feature-desc">
              On managed Chromebooks, students are signed in the moment they open the
              browser. No LinkJoin password to hand out, ever.
            </p>
          </div>
          <div className="nh-feature-card ext-feature-card">
            <h3 className="nh-feature-title">District-wide deployment</h3>
            <p className="nh-feature-desc">
              LinkJoin appears on every device in an organizational unit straight from the Google
              Admin console. Students are set up automatically.
            </p>
          </div>
        </div>
      </section>

      <section className="nh-cta">
        <div className="nh-cta-glow" aria-hidden="true" />
        <h2 className="nh-cta-h2">Never be late again.</h2>
        <p className="nh-cta-sub">Free on every plan. Installs in under a minute.</p>
        <div className="nh-cta-actions">
          <AddToChromeButton />
          <Link to="/schools" className="nh-btn-ghost nh-btn-lg">
            Deploying to a school or district?
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
