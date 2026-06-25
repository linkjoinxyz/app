import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/privacy.css'

export default function Privacy() {
  return (
    <div className="pp-page">
      <PublicHeader />

      <main className="pp-main">
        <div className="pp-body">
          <h1 className="pp-title">Privacy Policy</h1>

          <section className="pp-section">
            <p>
              LinkJoin ("we," "our," or "us") operates the LinkJoin service accessible at linkjoin.xyz. This Privacy Policy describes how we collect, use, and protect information you provide when using our service.
            </p>
            <p>
              By using LinkJoin, you agree to the collection and use of information as described in this policy.
            </p>
          </section>

          <section className="pp-section">
            <h2>1. Information We Collect</h2>
            <p>
              We collect the following information when you create an account or use our service:
            </p>
            <ul>
              <li><strong>Email address</strong> - required for account creation and authentication.</li>
              <li><strong>Phone number</strong> - optional, collected only if you enable SMS reminders.</li>
              <li><strong>Meeting link URLs</strong> - the links you schedule through LinkJoin. These are encrypted at rest using AES-256 (Fernet) encryption and are never shared with third parties.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>2. How We Use Your Information</h2>
            <p>
              Your information is used solely to provide the LinkJoin service. Specific uses include:
            </p>
            <ul>
              <li>Authenticating your account and maintaining your session.</li>
              <li>Scheduling and automatically opening your meeting links at the times you configure.</li>
              <li>Sending SMS reminders via Twilio if you have opted in to that feature.</li>
            </ul>
            <p>
              We do not use your data for advertising, profiling, or any purpose beyond operating the service.
            </p>
          </section>

          <section className="pp-section">
            <h2>3. Third-Party Service Providers</h2>
            <p>
              We work with the following third-party providers to operate LinkJoin:
            </p>
            <ul>
              <li><strong>Twilio</strong> - used to deliver SMS reminders when you opt in to that feature.</li>
              <li><strong>Gmail SMTP</strong> - used to send transactional emails such as account verification.</li>
            </ul>
            <p>
              These providers receive only the minimum information necessary to perform their function. We do not sell, rent, or otherwise transfer your personal information to any third party.
            </p>
          </section>

          <section className="pp-section">
            <h2>4. Data Retention and Deletion</h2>
            <p>
              You may delete individual meeting links and bookmarks at any time from within the application. To request full deletion of your account and all associated data, contact us at the address below. We will process your request within 30 days.
            </p>
          </section>

          <section className="pp-section">
            <h2>5. Security</h2>
            <p>
              We take reasonable technical measures to protect your information, including encryption of meeting URLs at rest. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="pp-section">
            <h2>6. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we will update the date at the top of this page. Continued use of the service after any changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="pp-section">
            <h2>7. Contact</h2>
            <p>
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p><a href="mailto:seth@linkjoin.xyz" className="pp-link">seth@linkjoin.xyz</a></p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
