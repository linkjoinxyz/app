import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/pricing.css'

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 1, position: 'static', width: 18, height: 18, zIndex: 'auto' }}>
      <circle cx="9" cy="9" r="9" fill="rgba(43,143,216,0.18)" />
      <path d="M5 9l3 3 5-5" stroke="#2B8FD8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlanCard({ badge, name, price, sub, description, features, cta, onClick, highlight }) {
  return (
    <div className={`plan-card${highlight ? ' plan-card-highlight' : ''}`}>
      {badge && <div className="plan-badge">{badge}</div>}
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
      <button className="plan-cta" onClick={onClick}>
        {cta}
      </button>
    </div>
  )
}

export default function Pricing() {
  return (
    <div className="pricing-root">
      <PublicHeader />

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
            description="Full access to every feature, forever. No catch."
            features={[
              'Unlimited scheduled meetings',
              'SMS reminders',
              'Bookmarks',
              'Chrome extension',
              'Shared links',
            ]}
            cta="Get started"
            onClick={() => window.open('/signup')}
          />
          <PlanCard
            highlight
            name="School"
            price="$1–5"
            sub="per user / month"
            description="Admin controls and automatic account setup for your entire organization."
            features={[
              'Everything in Individual',
              'Automatic account provisioning',
              'Admin controls & org-wide settings',
              'Disable links across your org',
              'Dedicated support',
            ]}
            cta="Get in touch"
            onClick={() => window.open('https://mail.google.com/mail/u/0/?fs=1&to=seth@linkjoin.xyz&tf=cm')}
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
