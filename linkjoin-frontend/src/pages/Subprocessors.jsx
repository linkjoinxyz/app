import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/privacy.css'

const SUBPROCESSORS = [
  {
    name: 'Twilio',
    purpose: 'SMS reminders — sends text messages to phone numbers that have opted in to pre-meeting reminders.',
    location: 'United States',
    privacy: 'https://www.twilio.com/en-us/legal/privacy',
  },
  {
    name: 'Anthropic',
    purpose: 'AI meeting extraction — when the optional Gmail auto-detect feature is used, email subject and body text are sent to Anthropic\'s API to extract meeting details (name, link, time, recurrence). Email content is not stored by LinkJoin beyond the duration of the extraction request.',
    location: 'United States',
    privacy: 'https://www.anthropic.com/privacy',
  },
  {
    name: 'Google (Gmail API / SMTP)',
    purpose: 'Transactional email — account verification, password reset, and shared-link notification emails.',
    location: 'United States',
    privacy: 'https://policies.google.com/privacy',
  },
  {
    name: 'MongoDB Atlas',
    purpose: 'Database hosting — stores user accounts, meeting schedules, attendance records, and bookmarks. Data is encrypted at rest.',
    location: 'United States',
    privacy: 'https://www.mongodb.com/legal/privacy-policy',
  },
]

export default function Subprocessors() {
  return (
    <div className="pp-page">
      <PublicHeader />

      <main className="pp-main">
        <div className="pp-body">
          <p className="pp-eyebrow">Legal</p>
          <h1 className="pp-title">Subprocessors</h1>
          <p className="pp-date">Last updated June 28, 2026</p>

          <section className="pp-section">
            <p>
              LinkJoin uses the third-party service providers listed below ("Subprocessors") to operate the service. Each Subprocessor receives only the minimum data necessary to perform its function and is bound by data protection obligations consistent with our <a href="/privacy-schools" className="pp-link">Student &amp; School Privacy Policy</a> and <a href="/dpa" className="pp-link">Data Processing Agreement</a>.
            </p>
            <p>
              Schools will be notified by email at least 10 business days before we add or materially change a Subprocessor that processes student data.
            </p>
          </section>

          {SUBPROCESSORS.map((sp) => (
            <section className="pp-section" key={sp.name}>
              <h2>{sp.name}</h2>
              <ul>
                <li><strong>Purpose:</strong> {sp.purpose}</li>
                <li><strong>Location:</strong> {sp.location}</li>
                <li><strong>Privacy Policy:</strong> <a href={sp.privacy} className="pp-link" target="_blank" rel="noreferrer">{sp.privacy}</a></li>
              </ul>
            </section>
          ))}

          <section className="pp-section">
            <h2>Questions</h2>
            <p>
              To request the full list of Subprocessors, object to a new Subprocessor, or ask questions about our data processing practices, contact <a href="mailto:seth@linkjoin.xyz" className="pp-link">seth@linkjoin.xyz</a>.
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
