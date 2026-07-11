import NhNav from '../components/NhNav.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/new-homepage.css'
import '../styles/privacy.css'

export default function BreachPolicy() {
  return (
    <div className="pp-page">
      <NhNav />

      <main className="pp-main">
        <div className="pp-body">
          <p className="pp-eyebrow">Legal</p>
          <h1 className="pp-title">Breach Notification Policy</h1>
          <p className="pp-date">Effective June 28, 2026</p>

          <section className="pp-section">
            <p>
              This policy describes how LinkJoin ("we," "us," "Provider") detects, responds to, and discloses security incidents that affect user data, including student data processed on behalf of schools.
            </p>
          </section>

          <section className="pp-section">
            <h2>1. What Constitutes a Breach</h2>
            <p>
              A "Breach" means any confirmed or reasonably suspected unauthorized acquisition, access, use, disclosure, modification, or destruction of personal data or student data maintained by LinkJoin. Examples include:
            </p>
            <ul>
              <li>Unauthorized access to the database containing user accounts or meeting records;</li>
              <li>Inadvertent disclosure of student data to an unauthorized third party;</li>
              <li>Loss or theft of a device or credential that could provide access to personal data;</li>
              <li>A successful phishing attack targeting a LinkJoin employee with access to personal data; and</li>
              <li>A vulnerability that allowed or could have allowed unauthorized access to personal data.</li>
            </ul>
            <p>
              Routine security events that are automatically blocked (e.g., failed login attempts, port scans) do not constitute a Breach unless they result in actual unauthorized access.
            </p>
          </section>

          <section className="pp-section">
            <h2>2. Detection and Assessment</h2>
            <p>
              LinkJoin maintains audit logs of all data access and modification events. Upon identifying a potential Breach, we will:
            </p>
            <ul>
              <li>Immediately contain the incident (revoke compromised credentials, isolate affected systems, etc.);</li>
              <li>Assess the scope — what data was accessed, by whom, for how long, and how many individuals are affected; and</li>
              <li>Determine whether the incident meets the definition of a Breach requiring notification.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>3. Notification Timeline</h2>
            <ul>
              <li><strong>Within 72 hours</strong> of becoming aware of a confirmed or reasonably suspected Breach, we will notify affected schools by email to the designated privacy contact provided in the Data Processing Agreement.</li>
              <li><strong>Within 30 days</strong> we will provide a full written incident report including root cause, remediation steps, and any changes to our security practices.</li>
            </ul>
            <p>
              For incidents affecting individual users (not school-deployed student data), we will notify affected users by email within 72 hours.
            </p>
          </section>

          <section className="pp-section">
            <h2>4. What the Notification Will Include</h2>
            <p>
              Each breach notification to a School will include, to the extent known at the time of notification:
            </p>
            <ul>
              <li>The date and time the Breach occurred and was discovered;</li>
              <li>A description of the nature of the Breach;</li>
              <li>The categories of personal data involved (e.g., email addresses, attendance records, phone numbers);</li>
              <li>The approximate number of students or users affected;</li>
              <li>The likely consequences of the Breach;</li>
              <li>The steps we have taken or intend to take to address the Breach and mitigate its effects; and</li>
              <li>The contact information of our breach response lead.</li>
            </ul>
            <p>
              If all information is not available within 72 hours, we will provide an initial notification with available information and follow up with additional details as they become known.
            </p>
          </section>

          <section className="pp-section">
            <h2>5. School Notification Obligations</h2>
            <p>
              Schools remain responsible for determining whether and how to notify parents, students, or applicable state authorities (e.g., state attorneys general, state education departments) in accordance with FERPA, applicable state breach notification laws, and their own policies. We will provide reasonable assistance and information to support those notifications.
            </p>
          </section>

          <section className="pp-section">
            <h2>6. Remediation</h2>
            <p>
              Following any confirmed Breach, we will:
            </p>
            <ul>
              <li>Identify and eliminate the root cause;</li>
              <li>Implement additional safeguards to prevent recurrence;</li>
              <li>Review and update this policy and our security practices as appropriate; and</li>
              <li>Provide the School with a written summary of remediation steps taken.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>7. Contact</h2>
            <p>
              To report a suspected security incident or vulnerability, or to ask questions about this policy, contact:
            </p>
            <p><a href="/contact" className="pp-link">Contact us</a></p>
            <p>
              Schools with a signed Data Processing Agreement should use the privacy contact address specified in that agreement. We treat all security reports as confidential.
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
