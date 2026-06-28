import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/privacy.css'

export default function Terms() {
  return (
    <div className="pp-page">
      <PublicHeader />

      <main className="pp-main">
        <div className="pp-body">
          <h1 className="pp-title">Terms of Service</h1>
          <p className="pp-date">Effective date: June 28, 2026</p>

          <section className="pp-section">
            <p>
              Please read these Terms of Service ("Terms") carefully before using LinkJoin ("the Service"), operated by LinkJoin ("we," "us," or "our") at linkjoin.xyz. By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.
            </p>
          </section>

          <section className="pp-section">
            <h2>1. Eligibility</h2>
            <p>
              You must be at least 13 years of age to use LinkJoin. By using the Service you represent that you meet this requirement and that all information you provide is accurate and complete. If you are using LinkJoin on behalf of an organization, you represent that you have authority to bind that organization to these Terms.
            </p>
          </section>

          <section className="pp-section">
            <h2>2. Description of Service</h2>
            <p>
              LinkJoin is a browser extension and web application that helps users organize, schedule, and automatically open virtual meeting links. Features include automatic detection of meeting links in email clients (Gmail, Outlook), AI-assisted meeting detail extraction, scheduled meeting reminders, and optional SMS notifications via third-party providers.
            </p>
            <p>
              We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time without notice or liability.
            </p>
          </section>

          <section className="pp-section">
            <h2>3. Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us immediately at support@linkjoin.xyz if you suspect unauthorized access. We are not liable for any loss or damage arising from your failure to protect your credentials.
            </p>
            <p>
              We may suspend or terminate your account at our discretion if we determine you have violated these Terms or if your account poses a security or legal risk.
            </p>
          </section>

          <section className="pp-section">
            <h2>4. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <ul>
              <li>Violate any applicable local, state, national, or international law or regulation.</li>
              <li>Transmit any content that is unlawful, harassing, defamatory, abusive, threatening, or otherwise objectionable.</li>
              <li>Attempt to gain unauthorized access to the Service, its servers, or any connected systems.</li>
              <li>Reverse engineer, decompile, or extract source code from any part of the Service.</li>
              <li>Use automated scripts or bots to interact with the Service in ways that could damage, disable, or overburden our infrastructure.</li>
              <li>Resell, sublicense, or otherwise exploit the Service for commercial purposes without our prior written consent.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>5. Browser Extension and Email Access</h2>
            <p>
              The LinkJoin browser extension reads the content of emails you have open in supported email clients (Gmail, Outlook) solely for the purpose of identifying meeting links on your behalf. This processing occurs locally in your browser. We do not transmit the full content of your emails to our servers. Only the limited data required to extract meeting details (subject line and relevant body text) is sent to our AI processing endpoint when you initiate a scan or when auto-detection is enabled.
            </p>
            <p>
              By installing and enabling the extension, you consent to this local processing. You may disable auto-detection at any time from the extension settings.
            </p>
          </section>

          <section className="pp-section">
            <h2>6. Third-Party Services</h2>
            <p>
              LinkJoin integrates with third-party services including but not limited to Anthropic (AI processing), Twilio (SMS reminders), and Google OAuth. Your use of features that involve these services is also subject to those providers' terms and privacy policies. We are not responsible for the practices or content of third-party services.
            </p>
          </section>

          <section className="pp-section">
            <h2>7. Intellectual Property</h2>
            <p>
              All content, design, code, trademarks, and materials that form the Service are the exclusive property of LinkJoin or its licensors and are protected by applicable intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service for your personal, non-commercial purposes. You may not copy, reproduce, distribute, or create derivative works from any part of the Service without our express written permission.
            </p>
            <p>
              You retain ownership of any data you submit to the Service (such as meeting URLs). By submitting data, you grant us a limited license to store and process that data solely to provide the Service to you.
            </p>
          </section>

          <section className="pp-section">
            <h2>8. Privacy</h2>
            <p>
              Your use of the Service is also governed by our <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference. Please review our Privacy Policy to understand our practices regarding the collection and use of your information.
            </p>
          </section>

          <section className="pp-section">
            <h2>9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS, OR THAT DEFECTS WILL BE CORRECTED.
            </p>
            <p>
              We do not warrant that the Service will open meeting links at any specific time or that scheduled reminders will be delivered without delay or failure.
            </p>
          </section>

          <section className="pp-section">
            <h2>10. Limitation of Liability</h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, LINKJOIN AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING FROM OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p>
              IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR (B) FIFTY DOLLARS (USD $50).
            </p>
          </section>

          <section className="pp-section">
            <h2>11. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless LinkJoin and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising from: (a) your use of the Service in violation of these Terms; (b) your violation of any applicable law or the rights of a third party; or (c) any content or data you submit to the Service.
            </p>
          </section>

          <section className="pp-section">
            <h2>12. Termination</h2>
            <p>
              You may stop using the Service and delete your account at any time by contacting us at support@linkjoin.xyz. We may suspend or terminate your access to the Service immediately, without prior notice, for conduct that we determine violates these Terms or is harmful to other users, us, or third parties.
            </p>
            <p>
              Upon termination, your right to use the Service ceases immediately. Sections 7, 9, 10, 11, and 13 survive termination.
            </p>
          </section>

          <section className="pp-section">
            <h2>13. Governing Law and Disputes</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law principles. Any dispute arising from or relating to these Terms or the Service shall be resolved exclusively in the state or federal courts located in Alameda County, California, and you consent to personal jurisdiction in those courts.
            </p>
            <p>
              You agree that any claim must be brought in your individual capacity and not as a plaintiff or class member in any class or representative proceeding.
            </p>
          </section>

          <section className="pp-section">
            <h2>14. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. When we do, we will revise the "Effective date" at the top of this page. Continued use of the Service after changes become effective constitutes your acceptance of the revised Terms. We encourage you to review this page periodically.
            </p>
          </section>

          <section className="pp-section">
            <h2>15. Contact</h2>
            <p>
              If you have questions about these Terms, please contact us at:
            </p>
            <p>
              <strong>LinkJoin</strong><br />
              Email: <a href="mailto:support@linkjoin.xyz">support@linkjoin.xyz</a>
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
