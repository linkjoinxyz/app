import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import NhNav from '../components/NhNav.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/new-homepage.css'
import '../styles/pricing.css'

const FEATURE_GROUPS = [
  {
    name: 'Core',
    rows: [
      { name: 'Unlimited scheduled meetings', individual: true, premium: true, school: true },
      { name: 'Auto-open meetings', individual: true, premium: true, school: true },
      { name: 'SMS reminders', individual: true, premium: true, school: true },
      { name: 'Bookmarks', individual: true, premium: true, school: true },
      { name: 'Notes', individual: true, premium: true, school: true },
      { name: 'Shared links', individual: true, premium: true, school: true },
      { name: 'Chrome extension', individual: true, premium: true, school: true },
      { name: 'Calendar view', individual: true, premium: true, school: true },
      { name: 'Two-factor authentication', individual: true, premium: true, school: true },
    ],
  },
  {
    name: 'Automation & AI',
    rows: [
      { name: 'Attendance history & streaks', individual: false, premium: true, school: true },
      { name: 'Calendar import (Google & Outlook)', individual: false, premium: true, school: true },
      { name: 'AI email meeting detection', individual: false, premium: true, school: true },
      { name: 'Auto-delete past meetings', individual: false, premium: true, school: true },
      { name: 'Vacation mode', individual: false, premium: true, school: true },
      { name: 'Open early', individual: false, premium: true, school: true },
    ],
  },
  {
    name: 'Institutional',
    rows: [
      { name: 'Automatic account provisioning', individual: false, premium: false, school: true },
      { name: 'Admin dashboard & org-wide settings', individual: false, premium: false, school: true },
      { name: 'Attendance tracking & redirect links', individual: false, premium: false, school: true },
      { name: 'Parent/guardian notifications', individual: false, premium: false, school: true },
      { name: 'Disable links across your org', individual: false, premium: false, school: true },
      { name: 'Dedicated support', individual: false, premium: false, school: true },
    ],
  },
]

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 1, position: 'static', width: 18, height: 18, zIndex: 'auto' }}>
      <circle cx="9" cy="9" r="9" fill="rgba(43,143,216,0.18)" />
      <path d="M5 9l3 3 5-5" style={{ stroke: 'var(--c-accent-550)' }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Dash() {
  return <span className="compare-dash">×</span>
}

function PlanCard({ badge, name, price, sub, description, features, cta, onClick, highlight, premium, ghost }) {
  return (
    <div className={`plan-card${highlight ? ' plan-card-highlight' : ''}${premium ? ' plan-card-premium' : ''}`}>
      {badge && <div className={`plan-badge${premium ? ' plan-badge-floating' : ''}`}>{badge}</div>}
      <div className="plan-name">{name}</div>
      <div className="plan-price-row">
        <span className="plan-price">{price}</span>
        {sub && <span className="plan-price-sub">{sub}</span>}
      </div>
      <p className="plan-description">{description}</p>
      <ul className="plan-features">
        {features.map((f, i) => (
          <li key={i}>
            <Check />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button className={`plan-cta${ghost ? ' plan-cta-ghost' : ''}`} onClick={onClick}>
        {cta}
      </button>
    </div>
  )
}

export default function Pricing() {
  const navigate = useNavigate()
  return (
    <div className="pricing-root">
      <NhNav />

      <main className="pricing-main">
        <div className="pricing-hero">
          <h1 className="pricing-title">Free for individuals.<br />Built for schools.</h1>
          <p className="pricing-subtitle">No hidden fees. No ads. Just LinkJoin.</p>
        </div>

        <div className="plan-cards">
          <PlanCard
            name="Individual"
            price="$0"
            sub="forever"
            description="Everything you need to run your meetings, free forever. No catch."
            features={[
              'Unlimited scheduled meetings',
              'SMS reminders',
              'Bookmarks',
              'Notes',
              'Chrome extension',
              'Shared links',
            ]}
            cta="Get started"
            onClick={() => window.open('/signup')}
          />
          <PlanCard
            badge="14-day free trial"
            premium
            name="Premium"
            price="$5"
            sub="/ month"
            description="Everything in Individual, plus AI-powered features and automation. No card required to try it."
            features={[
              'Everything in Individual',
              'Attendance history',
              'Calendar import (Google & Outlook)',
              'AI email meeting detection',
              'Auto-delete past meetings',
              'Vacation mode',
              'Open early',
            ]}
            cta="Start free trial"
            onClick={() => window.open('/signup')}
          />
          <PlanCard
            highlight
            name="School"
            price="$1–5"
            sub="/ user / month"
            description="Admin controls and automatic account setup for your entire organization."
            features={[
              'Everything in Individual',
              'Automatic account provisioning',
              'Admin controls & org-wide settings',
              'Disable links across your org',
              'Dedicated support',
            ]}
            cta="Get in touch"
            onClick={() => navigate('/contact')}
            ghost
          />
        </div>

        <div className="compare-section">
          <h2 className="compare-title">Full feature comparison</h2>
          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th className="compare-feature-col">Feature</th>
                  <th>Individual</th>
                  <th className="compare-premium-col">Premium</th>
                  <th>School</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map(group => (
                  <Fragment key={group.name}>
                    <tr className="compare-group-row">
                      <td colSpan={4}>{group.name}</td>
                    </tr>
                    {group.rows.map(row => (
                      <tr key={row.name}>
                        <td className="compare-feature-col">{row.name}</td>
                        <td>{row.individual ? <Check /> : <Dash />}</td>
                        <td className="compare-premium-col">{row.premium ? <Check /> : <Dash />}</td>
                        <td>{row.school ? <Check /> : <Dash />}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
