import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/privacy.css'

export default function DPA() {
  return (
    <div className="pp-page">
      <PublicHeader />

      <main className="pp-main">
        <div className="pp-body">
          <p className="pp-eyebrow">Legal</p>
          <h1 className="pp-title">Data Processing Agreement</h1>
          <p className="pp-date">Version 1.0 — Effective June 28, 2026</p>

          <section className="pp-section">
            <p>
              This Data Processing Agreement ("DPA") is entered into between LinkJoin ("Provider") and the educational institution executing this agreement ("School" or "LEA"). This DPA governs Provider's processing of Student Data on behalf of the School and supplements any separate subscription or service agreement between the parties.
            </p>
            <p>
              To execute this agreement, contact <a href="mailto:seth@linkjoin.xyz" className="pp-link">seth@linkjoin.xyz</a>. Schools that have signed this DPA are authorized to deploy LinkJoin to students and staff.
            </p>
          </section>

          <section className="pp-section">
            <h2>1. Definitions</h2>
            <ul>
              <li><strong>Student Data</strong> means any personally identifiable information (PII) that is directly related to an identifiable student and is collected, maintained, or processed by Provider on behalf of the School, including but not limited to: student email addresses, meeting join timestamps, attendance records, and phone numbers stored for SMS reminders.</li>
              <li><strong>Education Records</strong> has the meaning given under the Family Educational Rights and Privacy Act (FERPA), 20 U.S.C. § 1232g.</li>
              <li><strong>School Official</strong> means a contractor performing services for the School, as defined under FERPA's school official exception (34 C.F.R. § 99.31(a)(1)(i)(B)).</li>
              <li><strong>Authorized Purpose</strong> means providing the LinkJoin meeting automation service as described in the service agreement, including scheduling and automatically opening meeting links, sending SMS attendance reminders, and generating attendance analytics for teachers and administrators.</li>
              <li><strong>Subprocessor</strong> means any third party engaged by Provider to process Student Data in connection with the Service.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>2. FERPA School Official Designation</h2>
            <p>
              The School designates Provider as a "school official" under FERPA for the purpose of performing the Authorized Purpose. Provider acknowledges that in this capacity it:
            </p>
            <ul>
              <li>Performs an institutional service or function for the School;</li>
              <li>Has a legitimate educational interest in Student Data only to the extent necessary to perform the Authorized Purpose;</li>
              <li>Is under the direct control of the School with respect to the use and maintenance of Education Records; and</li>
              <li>May not re-disclose Student Data except as permitted by FERPA and this DPA.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>3. Permitted Uses of Student Data</h2>
            <p>
              Provider may process Student Data solely to:
            </p>
            <ul>
              <li>Schedule and automatically open meeting links at configured times for enrolled students;</li>
              <li>Record meeting join events (timestamp, latency relative to scheduled start time) for attendance reporting;</li>
              <li>Send SMS reminders to phone numbers provided by the School, parents, or students of sufficient age;</li>
              <li>Generate attendance analytics displayed to authorized teachers and administrators; and</li>
              <li>Respond to support requests from the School.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>4. Prohibited Uses</h2>
            <p>
              Provider shall not:
            </p>
            <ul>
              <li>Use Student Data for targeted advertising or to build advertising profiles;</li>
              <li>Sell, rent, trade, or otherwise transfer Student Data to any third party for commercial purposes;</li>
              <li>Use Student Data to train machine learning or AI models without the School's prior written authorization;</li>
              <li>Retain Student Data beyond the periods specified in Section 7;</li>
              <li>Combine Student Data with data from other schools or sources in a way that would enable re-identification of individual students across institutions; or</li>
              <li>Disclose Student Data to any party not listed as a Subprocessor in Schedule A without written consent from the School.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>5. COPPA Compliance</h2>
            <p>
              Where the School deploys LinkJoin to students under the age of 13, the School acts as agent for the parents of those students and provides consent on their behalf under COPPA's school consent exception (16 C.F.R. § 312.5(b)(1)). The School represents that it has provided or will provide COPPA-required notice to parents describing Provider's data collection and use practices before deploying the Service to students under 13.
            </p>
            <p>
              Provider will not knowingly collect personal information from students under 13 for any purpose beyond the Authorized Purpose. Provider will not require students under 13 to disclose more information than is reasonably necessary to participate in the Service.
            </p>
          </section>

          <section className="pp-section">
            <h2>6. Security Safeguards</h2>
            <p>
              Provider shall implement and maintain reasonable administrative, technical, and physical safeguards to protect Student Data, including:
            </p>
            <ul>
              <li>Encryption of meeting link URLs at rest using AES-256;</li>
              <li>Encryption of all Student Data in transit using TLS 1.2 or higher;</li>
              <li>Role-based access controls limiting data access to personnel with a need to know;</li>
              <li>Audit logging of all access to and modifications of Student Data;</li>
              <li>Regular security review of access credentials and access logs; and</li>
              <li>Employee training on data privacy obligations.</li>
            </ul>
            <p>
              Provider shall promptly remediate identified security vulnerabilities that could expose Student Data.
            </p>
          </section>

          <section className="pp-section">
            <h2>7. Data Retention and Deletion</h2>
            <p>
              Provider shall retain Student Data only as long as necessary to provide the Service or as required by applicable law. Upon termination of the service relationship or written request from the School:
            </p>
            <ul>
              <li>Provider shall delete or return all Student Data within 30 days;</li>
              <li>Provider shall delete all Student Data from backup systems within 90 days; and</li>
              <li>Provider shall provide written confirmation of deletion upon request.</li>
            </ul>
            <p>
              Individual student records shall be deleted within 30 days of a deletion request submitted by the School on behalf of a student or parent.
            </p>
          </section>

          <section className="pp-section">
            <h2>8. Breach Notification</h2>
            <p>
              In the event of a confirmed or reasonably suspected unauthorized acquisition, access, use, or disclosure of Student Data (a "Breach"), Provider shall:
            </p>
            <ul>
              <li>Notify the School's designated privacy contact within 72 hours of becoming aware of the Breach;</li>
              <li>Provide the School with a written description of: (a) the nature of the Breach; (b) the categories and approximate number of students affected; (c) the categories of Student Data involved; (d) likely consequences; and (e) measures taken or proposed to address the Breach;</li>
              <li>Cooperate with the School in investigating the Breach and providing information necessary for the School to fulfill its own notification obligations; and</li>
              <li>Take reasonable steps to mitigate the effects of the Breach and prevent recurrence.</li>
            </ul>
            <p>
              See also Provider's <a href="/breach-policy" className="pp-link">Breach Notification Policy</a>.
            </p>
          </section>

          <section className="pp-section">
            <h2>9. Subprocessors</h2>
            <p>
              Provider currently engages the Subprocessors listed at <a href="/subprocessors" className="pp-link">linkjoin.xyz/subprocessors</a> (Schedule A). Provider shall update that page before engaging any new Subprocessor that will process Student Data, and shall notify the School by email at least 10 business days in advance.
            </p>
            <p>
              Each Subprocessor is bound by data protection obligations no less restrictive than those in this DPA. Provider remains fully liable for the acts and omissions of its Subprocessors with respect to Student Data.
            </p>
          </section>

          <section className="pp-section">
            <h2>10. School Rights</h2>
            <p>
              The School retains ownership of all Student Data. The School may at any time:
            </p>
            <ul>
              <li>Request access to Student Data held by Provider;</li>
              <li>Request correction of inaccurate Student Data;</li>
              <li>Request deletion of Student Data for an individual student or for the entire School;</li>
              <li>Request a list of all Subprocessors processing Student Data; and</li>
              <li>Audit Provider's compliance with this DPA upon reasonable notice, no more than once per calendar year.</li>
            </ul>
            <p>
              To exercise these rights, contact <a href="mailto:seth@linkjoin.xyz" className="pp-link">seth@linkjoin.xyz</a>.
            </p>
          </section>

          <section className="pp-section">
            <h2>11. Governing Law and State Compliance</h2>
            <p>
              This DPA is governed by applicable federal law (FERPA, COPPA) and, to the extent applicable, state student privacy laws including but not limited to: California Student Online Personal Information Protection Act (SOPIPA, Bus. &amp; Prof. Code § 22584); New York Education Law § 2-d; and comparable laws in other states.
            </p>
            <p>
              Where state law imposes obligations stricter than those in this DPA, Provider shall comply with the stricter standard.
            </p>
          </section>

          <section className="pp-section">
            <h2>12. Term and Termination</h2>
            <p>
              This DPA remains in effect for the duration of the service relationship and for so long as Provider retains any Student Data. Either party may terminate this DPA upon 30 days' written notice. Upon termination, Provider's obligations under Sections 7 (Retention and Deletion) and 8 (Breach Notification) survive.
            </p>
          </section>

          <section className="pp-section">
            <h2>13. Entire Agreement</h2>
            <p>
              This DPA, together with any applicable service agreement and Schedule A (Subprocessors), constitutes the entire agreement between the parties regarding the processing of Student Data and supersedes all prior representations or agreements on that subject.
            </p>
          </section>

          <section className="pp-section">
            <h2>Execute This Agreement</h2>
            <p>
              To sign this DPA on behalf of your school or district, email <a href="mailto:seth@linkjoin.xyz" className="pp-link">seth@linkjoin.xyz</a> with the subject line "DPA Request" and include your institution name, your name and title, and the email address that should appear on the executed agreement. We will return a countersigned copy within 3 business days.
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
