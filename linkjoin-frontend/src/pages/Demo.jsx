import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import '../styles/school.css'
import '../styles/demo.css'

export default function Demo() {
  const [scrolled, setScrolled] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', school: '', role: '', message: '' })
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    try {
      await apiFetch('/contact', { method: 'POST', body: JSON.stringify(form) })
      setStatus('sent')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  return (
    <div className="sc-root">
      <nav className={`sc-nav${scrolled ? ' sc-nav--scrolled' : ''}`}>
        <Link to="/" className="sc-nav-logo">
          <img src="/images/logo.svg" alt="LinkJoin" />
          LinkJoin
        </Link>
        <div className="sc-nav-right">
          <Link to="/login" className="sc-nav-login">Log in</Link>
          <Link to="/signup" className="sc-btn-primary">Get started</Link>
        </div>
      </nav>

      <main className="dm-main">
        <div className="dm-split">
          <div className="dm-left">
            <span className="sc-hero-eyebrow">For K–12 schools &amp; districts</span>
            <h1 className="dm-h1">See LinkJoin in action.</h1>
            <p className="dm-sub">Fill out the form and we'll reach out to schedule a personalized walkthrough for your school or district.</p>
            <ul className="dm-bullets">
              <li>Live attendance tracking with zero teacher effort</li>
              <li>Gradebook sync with Google Classroom &amp; Canvas</li>
              <li>Family absence alerts via SMS &amp; email</li>
              <li>Clever &amp; OneRoster roster sync</li>
            </ul>
          </div>

          <div className="dm-right">
            {status === 'sent' ? (
              <div className="dm-success">
                <div className="dm-success-icon">✓</div>
                <h2 className="dm-success-title">Request received!</h2>
                <p className="dm-success-body">We'll be in touch within one business day to schedule your demo.</p>
                <Link to="/schools" className="sc-btn-primary" style={{ display: 'inline-block', marginTop: 24 }}>Back to schools page</Link>
              </div>
            ) : (
              <form className="dm-form" onSubmit={handleSubmit}>
                <div className="dm-form-row">
                  <div className="dm-field">
                    <label htmlFor="first_name">First name</label>
                    <input id="first_name" name="first_name" type="text" required placeholder="Jane" value={form.first_name} onChange={handleChange} />
                  </div>
                  <div className="dm-field">
                    <label htmlFor="last_name">Last name</label>
                    <input id="last_name" name="last_name" type="text" required placeholder="Smith" value={form.last_name} onChange={handleChange} />
                  </div>
                </div>

                <div className="dm-field">
                  <label htmlFor="email">Work email</label>
                  <input id="email" name="email" type="email" required placeholder="jane@lincoln.edu" value={form.email} onChange={handleChange} />
                </div>

                <div className="dm-field">
                  <label htmlFor="school">School / district</label>
                  <input id="school" name="school" type="text" required placeholder="Lincoln Unified School District" value={form.school} onChange={handleChange} />
                </div>

                <div className="dm-field">
                  <label htmlFor="role">Your role</label>
                  <select id="role" name="role" required value={form.role} onChange={handleChange}>
                    <option value="" disabled>Select a role…</option>
                    <option value="Teacher">Teacher</option>
                    <option value="School Administrator">School Administrator</option>
                    <option value="District Administrator">District Administrator</option>
                    <option value="IT / Technology">IT / Technology</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="dm-field">
                  <label htmlFor="message">Anything specific you'd like to see? <span className="dm-optional">(optional)</span></label>
                  <textarea id="message" name="message" rows={3} placeholder="e.g. attendance reporting, Clever sync, Canvas gradebook…" value={form.message} onChange={handleChange} />
                </div>

                {status === 'error' && (
                  <p className="dm-error">Something went wrong. Please try again.</p>
                )}

                <button type="submit" className="sc-btn-primary dm-submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Sending…' : 'Request demo'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
