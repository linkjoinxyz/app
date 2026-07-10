import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/privacy.css'

export default function PrivacySchools() {
  return (
    <div className="pp-page">
      <PublicHeader />

      <main className="pp-main">
        <div className="pp-body">
          <p className="pp-eyebrow">Legal</p>
          <h1 className="pp-title">Student &amp; School Privacy Policy</h1>
          <p className="pp-date">Effective June 28, 2026</p>

          <section className="pp-section">
            <p>
              This policy supplements our general <a href="/privacy" className="pp-link">Privacy Policy</a> and applies specifically to students, teachers, school administrators, and parents using LinkJoin in an educational setting. If there is a conflict between this policy and the general Privacy Policy, this policy controls for educational users.
            </p>
          </section>

          <section className="pp-section">
            <h2>1. Our Role Under FERPA</h2>
            <p>
              When a school or district ("School") deploys LinkJoin to students, we act as a "school official" under the Family Educational Rights and Privacy Act (FERPA), 20 U.S.C. § 1232g. This means:
            </p>
            <ul>
              <li>The School controls how student data is used — we process it only on the School's behalf and for the Authorized Purpose defined in our Data Processing Agreement.</li>
              <li>We do not disclose student education records to third parties except as permitted by FERPA and our Data Processing Agreement.</li>
              <li>Parent and eligible student rights under FERPA (access, amendment, and disclosure controls) are exercised through the School, not directly through us.</li>
            </ul>
            <p>
              Schools deploying LinkJoin to students should have a signed <a href="/dpa" className="pp-link">Data Processing Agreement</a> in place before doing so.
            </p>
          </section>

          <section className="pp-section">
            <h2>2. What We Collect from Students</h2>
            <p>
              When LinkJoin is deployed in a school context, we may collect the following information about students:
            </p>
            <ul>
              <li><strong>Email address</strong> — used as the account identifier. Required for login.</li>
              <li><strong>Meeting join timestamps</strong> — the date and time a student's browser opened a scheduled meeting link. Used to generate attendance records.</li>
              <li><strong>Join latency</strong> — the number of minutes between the scheduled start time and the actual join time. Used to calculate on-time, late, or missed status.</li>
              <li><strong>Phone number</strong> — optional, collected only if the School enables SMS reminders for a student or parent.</li>
              <li><strong>Timezone and UTC offset</strong> — used to correctly schedule and display meeting times.</li>
            </ul>
            <p>
              We do not collect Social Security numbers, government-issued IDs, financial information, health information, or biometric data from students.
            </p>
          </section>

          <section className="pp-section">
            <h2>3. Students Under 13 (COPPA)</h2>
            <p>
              LinkJoin complies with the Children's Online Privacy Protection Act (COPPA). When a school deploys LinkJoin to students under 13, the School acts as agent for parents and provides consent on their behalf under the COPPA school consent exception (16 C.F.R. § 312.5(b)(1)).
            </p>
            <p>
              We do not knowingly collect personal information from students under 13 for any purpose beyond providing the educational service. We do not use information from students under 13 for advertising, marketing, or any commercial purpose. We do not require students under 13 to disclose more information than is reasonably necessary to use the service.
            </p>
            <p>
              Parents of students under 13 may request access to or deletion of their child's information by contacting the School, which will forward the request to us.
            </p>
          </section>

          <section className="pp-section">
            <h2>4. How We Use Student Data</h2>
            <p>
              Student data is used solely to provide the LinkJoin service to the School, including:
            </p>
            <ul>
              <li>Automatically opening meeting links at scheduled class times;</li>
              <li>Recording attendance events (joined, late, missed);</li>
              <li>Displaying real-time and historical attendance data to authorized teachers and administrators;</li>
              <li>Sending SMS reminders to phone numbers provided by the School before scheduled class times; and</li>
              <li>Responding to School support requests about specific student records.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>5. What We Do Not Do</h2>
            <ul>
              <li>We do not use student data for targeted advertising or build advertising profiles from student data.</li>
              <li>We do not sell, rent, or trade student data to any third party.</li>
              <li>We do not use student data to train AI or machine learning models without the School's prior written authorization.</li>
              <li>We do not combine individual student data across schools or institutions.</li>
              <li>We do not share student data with any party not listed in our <a href="/subprocessors" className="pp-link">Subprocessors list</a> without the School's consent.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>6. AI Processing of Email Content</h2>
            <p>
              LinkJoin's browser extension includes an optional feature that detects meeting links in Gmail messages and extracts meeting details automatically. When a student or teacher uses this feature, the subject line and body of the relevant email are sent to Anthropic (our AI provider) to extract meeting name, link, time, and recurrence information.
            </p>
            <p>
              This feature is optional and initiated only when the user explicitly interacts with the extraction UI. Email content sent to Anthropic is not stored by LinkJoin beyond the duration of the extraction request. Anthropic is listed as a Subprocessor and is bound by data protection obligations consistent with this policy.
            </p>
            <p>
              Schools with data residency or AI-processing restrictions should contact us before enabling this feature.
            </p>
          </section>

          <section className="pp-section">
            <h2>7. Subprocessors</h2>
            <p>
              We share student data only with the subprocessors listed at <a href="/subprocessors" className="pp-link">linkjoin.xyz/subprocessors</a>. We will update that page and notify Schools by email at least 10 business days before engaging a new subprocessor that processes student data.
            </p>
          </section>

          <section className="pp-section">
            <h2>8. Data Retention</h2>
            <p>
              We retain student data for as long as the School maintains an active account with LinkJoin. Upon account termination or written request, we delete all student data within 30 days. Backup copies are purged within 90 days.
            </p>
            <p>
              Attendance records (join timestamps) are retained for a maximum of 3 years unless the School requests earlier deletion or applicable law requires a shorter period.
            </p>
          </section>

          <section className="pp-section">
            <h2>9. Security and Data Residency</h2>
            <p>
              We protect student data with the following technical safeguards:
            </p>
            <ul>
              <li>Meeting link URLs are encrypted at rest using AES-256.</li>
              <li>All data is transmitted over TLS (HTTPS).</li>
              <li>Strict Transport Security (HSTS) is enforced to prevent downgrade attacks.</li>
              <li>All data access and modifications are recorded in an audit log, retained for 24 months.</li>
              <li>Access to student data is limited to personnel with a legitimate need.</li>
            </ul>
            <p>
              <strong>Data Residency.</strong> All student data is processed and stored exclusively in the United States. Application servers run on Microsoft Azure (US West region). The database is hosted on MongoDB Atlas (US region, AES-256 encryption at rest). No student data is transferred outside the United States.
            </p>
          </section>

          <section className="pp-section">
            <h2>10. Your Rights</h2>
            <p>
              <strong>Schools</strong> may at any time request access to, correction of, or deletion of student data by <a href="/contact" className="pp-link">contacting us</a>. We will respond within 30 days.
            </p>
            <p>
              <strong>Parents and eligible students</strong> exercise FERPA rights through the School. If a School directs us to provide, correct, or delete student records on behalf of a parent or eligible student, we will do so within 30 days of the School's written request.
            </p>
            <p>
              <strong>California residents</strong> may have additional rights under SOPIPA and the California Consumer Privacy Act. <a href="/contact" className="pp-link">Contact us</a> to exercise these rights.
            </p>
          </section>

          <section className="pp-section">
            <h2>11. Breach Notification</h2>
            <p>
              In the event of a confirmed or reasonably suspected breach involving student data, we will notify the affected School within 72 hours. See our full <a href="/breach-policy" className="pp-link">Breach Notification Policy</a> for details.
            </p>
          </section>

          <section className="pp-section">
            <h2>12. Contact</h2>
            <p>
              For questions about this policy, FERPA data requests, or to report a privacy concern, contact:
            </p>
            <p><a href="/contact" className="pp-link">Contact us</a></p>
            <p>
              For schools that have not yet signed a Data Processing Agreement, visit <a href="/dpa" className="pp-link">linkjoin.xyz/dpa</a>.
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
