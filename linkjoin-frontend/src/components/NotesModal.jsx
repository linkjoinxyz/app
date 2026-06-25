import { useState, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { usersApi } from '../api/users.js'
import { useModalClose } from '../hooks/useModalClose.js'
import '../styles/modal.css'

export default function NotesModal({ link, onClose }) {
  const { closing, handleClose } = useModalClose(onClose)
  const [markdown, setMarkdown] = useState('')
  const [preview, setPreview] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    usersApi.getNotes()
      .then(notes => {
        const note = notes.find(n => n.id === link.id)
        const md = note?.markdown || ''
        setMarkdown(md)
        if (md) {
          usersApi.markdownToHtml(md).then(r => setPreview(r.html)).catch(() => {})
        } else {
          setEditing(true)
        }
      })
      .catch(() => { setEditing(true) })
  }, [link.id])

  async function switchToPreview() {
    setEditing(false)
    if (!markdown.trim()) { setPreview(''); return }
    try {
      const result = await usersApi.markdownToHtml(markdown)
      setPreview(result.html)
    } catch {
      setPreview('<em>Preview unavailable</em>')
    }
  }

  function enterEdit() {
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function handleSave() {
    setSaving(true)
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    try {
      await usersApi.saveNote({ id: link.id, name: link.name, markdown, date: today })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {} finally {
      setSaving(false)
    }
  }

  return (
    <div className={`modal-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="modal-card modal-notes" onClick={e => e.stopPropagation()}>
        <img src="/images/arrow-left.svg" className="modal-back" alt="back" onClick={handleClose} />
        <div className="modal-title">
          Notes: <span style={{ color: 'var(--lightblue)' }}>{link.name}</span>
        </div>

        <div
          className={`modal-notes-field${editing ? ' editing' : ''}`}
          onClick={!editing ? enterEdit : undefined}
        >
          {editing ? (
            <textarea
              ref={textareaRef}
              className="modal-notes-textarea"
              placeholder="Write notes in markdown..."
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              onBlur={switchToPreview}
            />
          ) : preview || markdown ? (
            <div
              className="modal-notes-preview"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview, { ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'a'], ALLOWED_ATTR: ['href', 'target'] }) }}
            />
          ) : (
            <div className="modal-notes-placeholder">Write notes in markdown...</div>
          )}
        </div>

        <button
          className={`modal-submit${saving ? ' disabled' : ''}`}
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: 20 }}
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  )
}
