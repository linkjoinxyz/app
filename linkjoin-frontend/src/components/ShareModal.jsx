import { useState, useRef } from 'react'
import { linksApi } from '../api/links.js'
import { useModalClose } from '../hooks/useModalClose.js'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/modal.css'

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

export default function ShareModal({ link, type = 'link', onClose }) {
  const { closing, handleClose } = useModalClose(onClose)
  const { email: currentUserEmail } = useAuth()
  const [emailInput, setEmailInput] = useState('')
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inputInvalid, setInputInvalid] = useState(false)
  const inputRef = useRef(null)

  function addEmail() {
    const val = emailInput.trim().toLowerCase()
    if (!val) return
    if (!EMAIL_RE.test(val)) { setInputInvalid(true); return }
    if (val === currentUserEmail?.toLowerCase()) { setError("You can't share a link with yourself."); setEmailInput(''); return }
    if (!emails.includes(val)) setEmails(prev => [...prev, val])
    setEmailInput('')
    setInputInvalid(false)
    setError('')
  }

  function removeEmail(e) {
    setEmails(prev => prev.filter(em => em !== e))
  }

  async function handleShare() {
    if (!emails.length) { setError('Add at least one email.'); return }
    setLoading(true)
    setError('')
    try {
      await linksApi.share(link, emails, type)
      handleClose()
    } catch (e) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`modal-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <img src="/images/arrow-left.svg" className="modal-back" alt="back" onClick={handleClose} />
        <div className="modal-title">
          Share <span style={{ color: 'var(--lightblue)' }}>{link?.name}</span>:
        </div>

        <div className="modal-share-field" onClick={() => inputRef.current?.focus()}>
          {emails.map(em => (
            <span key={em} className="modal-share-pill" onClick={ev => { ev.stopPropagation(); removeEmail(em) }}>
              {em}
            </span>
          ))}
          <input
            ref={inputRef}
            className="modal-share-input"
            placeholder={emails.length ? '' : 'Add email address...'}
            value={emailInput}
            onChange={e => { setEmailInput(e.target.value); setInputInvalid(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addEmail() }
              if (e.key === 'Escape') { setInputInvalid(false) }
            }}
            onBlur={() => { if (emailInput.trim()) addEmail() }}
            style={inputInvalid ? { color: '#ff5f5f' } : undefined}
          />
        </div>

        {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}

        <button
          className={`modal-submit${loading ? ' disabled' : ''}`}
          onClick={handleShare}
          disabled={loading}
          style={{ marginTop: 24 }}
        >
          Send invite
        </button>
      </div>
    </div>
  )
}
