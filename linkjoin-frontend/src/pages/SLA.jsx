import NhNav from '../components/NhNav.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/new-homepage.css'
import '../styles/privacy.css'

export default function SLA() {
  return (
    <div className="pp-page">
      <NhNav />
      <main className="pp-main">
        <div className="pp-body">
          <p className="pp-eyebrow">Legal</p>
          <h1 className="pp-title">Service Level Agreement</h1>
          <p className="pp-date">Version 1.0 — Effective July 11, 2026</p>

          <section className="pp-section">
            <p>
              This Service Level Agreement ("SLA") describes the availability commitments
              LinkJoin ("Provider") makes to educational institutions ("School") that have
              executed a subscription or service agreement. Schools on a free plan receive
              commercially reasonable efforts but no uptime guarantee.
            </p>
          </section>

          <section className="pp-section">
            <h2>1. Uptime Commitment</h2>
            <p>
              Provider commits to a monthly uptime of <strong>99.5%</strong> for the
              LinkJoin web application and API, measured across each calendar month. Uptime
              is defined as the percentage of minutes in the month during which the service
              is reachable and returning non-5xx responses to authenticated requests.
            </p>
            <p>
              Downtime minutes do not include:
            </p>
            <ul>
              <li>Scheduled maintenance windows (see §4)</li>
              <li>Outages caused by third-party infrastructure outside Provider's control
                (Zoom, Google Meet, MongoDB Atlas, Azure, Twilio)</li>
              <li>Force majeure events</li>
              <li>Customer-caused outages (e.g., misconfigured integration credentials)</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>2. Recovery Objectives</h2>
            <ul>
              <li>
                <strong>Recovery Time Objective (RTO):</strong> Provider will restore service
                within <strong>2 hours</strong> of declaring a P0 or P1 incident.
              </li>
              <li>
                <strong>Recovery Point Objective (RPO):</strong> In the event of data loss,
                Provider will restore data to a state no older than <strong>24 hours</strong>
                prior to the incident, using automated daily backups.
              </li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>3. Incident Response</h2>
            <p>
              Provider classifies incidents by severity and commits to the following initial
              response times from the moment an incident is detected or reported:
            </p>
            <ul>
              <li><strong>P0 — Critical (service down):</strong> Acknowledge within 15 minutes,
                begin remediation immediately, status update every 30 minutes</li>
              <li><strong>P1 — High (major feature unavailable):</strong> Acknowledge within
                1 hour, status update every 2 hours</li>
              <li><strong>P2 — Medium (degraded performance):</strong> Acknowledge within
                4 hours, resolve within 1 business day</li>
              <li><strong>P3 — Low (minor issue):</strong> Acknowledge within 1 business day,
                resolve within 5 business days</li>
            </ul>
            <p>
              Incident status is published in real time at{' '}
              <a href="/status" className="pp-link">linkjoin.xyz/status</a>.
              Active incidents trigger an in-app banner visible to all users.
            </p>
          </section>

          <section className="pp-section">
            <h2>4. Maintenance Windows</h2>
            <p>
              Scheduled maintenance occurs on <strong>Sundays between 02:00 and 04:00 UTC</strong>.
              Provider will post a notice on the status page at least <strong>48 hours</strong> in
              advance for any maintenance expected to cause more than 5 minutes of downtime.
              Emergency maintenance may be performed outside this window with notice as soon
              as practicable.
            </p>
          </section>

          <section className="pp-section">
            <h2>5. Service Credits</h2>
            <p>
              If Provider fails to meet the 99.5% uptime commitment in a given calendar month,
              the School may request a service credit equal to:
            </p>
            <ul>
              <li><strong>99.0% – 99.49% actual uptime:</strong> 10% of that month's fee</li>
              <li><strong>95.0% – 98.99% actual uptime:</strong> 25% of that month's fee</li>
              <li><strong>Below 95.0% actual uptime:</strong> 50% of that month's fee</li>
            </ul>
            <p>
              Credits must be requested within 30 days of the end of the affected month by
              emailing <a href="mailto:support@linkjoin.xyz" className="pp-link">support@linkjoin.xyz</a>.
              Credits apply to future invoices and are the School's sole remedy for uptime failures.
            </p>
          </section>

          <section className="pp-section">
            <h2>6. Support</h2>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:support@linkjoin.xyz" className="pp-link">support@linkjoin.xyz</a></li>
              <li><strong>Status page:</strong> <a href="/status" className="pp-link">linkjoin.xyz/status</a></li>
              <li><strong>Business hours:</strong> Monday through Friday, 9:00 AM – 6:00 PM PT</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>7. Modifications</h2>
            <p>
              Provider may update this SLA with 30 days' written notice. Continued use of
              the service after the notice period constitutes acceptance of the updated terms.
            </p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
