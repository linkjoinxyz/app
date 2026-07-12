import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { usersApi } from '../api/users.js'
import SideNav from '../components/SideNav.jsx'
import '../styles/notes.css'

const ALLOWED = {
  ALLOWED_TAGS: ['p','br','b','i','em','strong','code','pre','ul','ol','li','blockquote','h1','h2','h3','a'],
  ALLOWED_ATTR: ['href','target'],
}

function NoteCard({ note, defaultExpanded, onSave }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [editing, setEditing] = useState(defaultExpanded && !note.markdown)
  const [markdown, setMarkdown] = useState(note.markdown || '')
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (defaultExpanded) setExpanded(true)
  }, [defaultExpanded])

  // Load preview when switching to preview mode or on expand with existing content
  async function loadPreview(md) {
    if (!md.trim()) { setPreview(''); return }
    try {
      const r = await usersApi.markdownToHtml(md)
      setPreview(r.html)
    } catch {
      setPreview('')
    }
  }

  function handleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && markdown && !editing) loadPreview(markdown)
  }

  function switchToPreview() {
    setEditing(false)
    loadPreview(markdown)
  }

  function switchToEdit() {
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    try {
      await usersApi.saveNote({ id: note.id, name: note.name, markdown, date: today })
      setSaved(true)
      onSave?.({ ...note, markdown, date: today })
      setTimeout(() => setSaved(false), 2000)
    } catch {} finally {
      setSaving(false)
    }
  }

  const previewText = (note.markdown || '').replace(/[#*_`>\[\]]/g, '').slice(0, 120)

  return (
    <div className={`note-card${expanded ? ' note-card--expanded' : ''}`}>
      <div className="note-card-summary" onClick={handleExpand}>
        <svg className="note-card-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <div className="note-card-meta">
          <div className="note-card-name">{note.name}</div>
          {note.date && <div className="note-card-date">{note.date}</div>}
        </div>
        <svg className="note-card-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>

      {expanded && (
        <div className="note-card-body">
          <div className="note-editor-toolbar">
            <button
              className={`note-editor-tab${editing ? ' note-editor-tab--active' : ''}`}
              onClick={switchToEdit}
            >Edit</button>
            <button
              className={`note-editor-tab${!editing ? ' note-editor-tab--active' : ''}`}
              onClick={switchToPreview}
            >Preview</button>
            <button
              className={`note-editor-save${saved ? ' note-editor-save--saved' : ''}`}
              onClick={handleSave}
              disabled={saving}
            >{saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}</button>
          </div>

          {editing ? (
            <textarea
              className="note-editor-textarea"
              placeholder="Write notes in markdown..."
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              autoFocus
            />
          ) : preview ? (
            <div
              className="note-editor-preview"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview, ALLOWED) }}
            />
          ) : markdown ? (
            <div className="note-editor-preview">{markdown}</div>
          ) : (
            <div className="note-editor-placeholder">No content yet. Click Edit to write.</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const autoLinkId = searchParams.get('link_id')
  const autoLinkName = searchParams.get('name')

  useEffect(() => {
    usersApi.getNotes()
      .then(data => {
        const list = Array.isArray(data) ? data : []
        if (autoLinkId && autoLinkName && !list.find(n => String(n.id) === String(autoLinkId))) {
          list.unshift({ id: autoLinkId, name: decodeURIComponent(autoLinkName), markdown: '', date: null })
        }
        setNotes(list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleSave(updated) {
    setNotes(prev => prev.map(n => String(n.id) === String(updated.id) ? updated : n))
  }

  const q = search.toLowerCase()
  const filtered = q
    ? notes.filter(n => n.name.toLowerCase().includes(q) || (n.markdown || '').toLowerCase().includes(q))
    : notes

  return (
    <div style={{ display: 'flex' }}>
      <SideNav page="notes" search={search} onSearch={setSearch} searchPlaceholder="Search notes…" />
      <div className="sn-content notes-root">
        {loading ? null : filtered.length === 0 ? (
          <div className="notes-empty">
            {search ? 'No notes match your search.' : 'No notes yet. Open a meeting and add notes from the dot menu.'}
          </div>
        ) : (
          <div className="notes-list">
            {filtered.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                defaultExpanded={autoLinkId && String(note.id) === String(autoLinkId)}
                onSave={handleSave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
