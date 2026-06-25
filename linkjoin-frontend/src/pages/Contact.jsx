import { useState } from 'react'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import '../styles/contact.css'

const API = import.meta.env.VITE_API_URL || ''

export default function Contact() {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', message: '' })
  const [status, setStatus] = useState('idle')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch(`${API}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      setStatus('sent')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <div className="ct-page">
      <PublicHeader />

      <main className="ct-main">
        <div className="ct-body">
          <h1 className="ct-title">Get in Touch</h1>
          {status === 'sent' ? (
            <div className="ct-success">
              <p>Message received. We will be in touch soon.</p>
            </div>
          ) : (
            <form className="ct-form" onSubmit={handleSubmit}>
              <div className="ct-row">
                <div className="ct-field">
                  <label htmlFor="first_name">First Name</label>
                  <input
                    id="first_name"
                    name="first_name"
                    type="text"
                    required
                    value={form.first_name}
                    onChange={handleChange}
                    placeholder="Jane"
                  />
                </div>
                <div className="ct-field">
                  <label htmlFor="last_name">Last Name</label>
                  <input
                    id="last_name"
                    name="last_name"
                    type="text"
                    required
                    value={form.last_name}
                    onChange={handleChange}
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="ct-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="text"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="jane@example.com"
                />
              </div>

              <div className="ct-field">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={6}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="What can we help you with?"
                />
              </div>

              {status === 'error' && (
                <p className="ct-error">Something went wrong. Please try again or email us directly at seth@linkjoin.xyz.</p>
              )}

              <button type="submit" className="ct-submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
