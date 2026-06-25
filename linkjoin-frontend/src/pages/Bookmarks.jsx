import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModalClose } from '../hooks/useModalClose.js'
import { openSafeUrl } from '../utils.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useWebSocket } from '../hooks/useWebSocket.js'
import { usersApi } from '../api/users.js'
import { bookmarksApi } from '../api/bookmarks.js'
import { linksApi } from '../api/links.js'
import Header from '../components/HeaderModern.jsx'
import ShareModal from '../components/ShareModal.jsx'
import DeleteModal from '../components/DeleteModal.jsx'
import SettingsModal from '../components/SettingsModal.jsx'
import '../styles/bookmarks.css'
import '../styles/modal.css'

function BookmarkCard({ bookmark, onEdit, onShare, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuBtnRef = useRef(null)
  const menuContentRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (
        menuBtnRef.current && !menuBtnRef.current.contains(e.target) &&
        (!menuContentRef.current || !menuContentRef.current.contains(e.target))
      ) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleMenuToggle(e) {
    e.stopPropagation()
    if (!menuOpen) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      const estimatedHeight = 130
      const spaceBelow = window.innerHeight - rect.bottom - 6
      const spaceAbove = rect.top - 6
      const top = (spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove)
        ? rect.bottom + 6
        : Math.max(6, rect.top - estimatedHeight - 6)
      setMenuPos({ top, right: window.innerWidth - rect.right })
    }
    setMenuOpen(m => !m)
  }

  return (
    <div className="link link_event" id={`bookmark-${bookmark.id}`}>
      <div className="join-meeting" onClick={() => openSafeUrl(bookmark.link)}>
        <div className="name">{bookmark.name}</div>
        <div className="description">Click to open bookmark</div>
      </div>
      <img
        ref={menuBtnRef}
        src="/images/ellipsis.svg"
        className="dot-menu"
        alt="menu"
        onClick={handleMenuToggle}
      />
      {menuOpen && createPortal(
        <div
          ref={menuContentRef}
          className="menu"
          style={{ display: 'flex', position: 'fixed', ...menuPos, zIndex: 1000 }}
          onClick={e => e.stopPropagation()}
        >
          <div onClick={() => { setMenuOpen(false); onEdit(bookmark) }}>Edit</div>
          <hr className="menu_line" />
          <div onClick={() => { setMenuOpen(false); onDelete(bookmark) }}>Delete</div>
          <hr className="menu_line" />
          <div onClick={() => { setMenuOpen(false); onShare(bookmark) }}>Share</div>
        </div>,
        document.body
      )}
    </div>
  )
}

function BookmarkModal({ visible, editBookmark, onClose, onSuccess }) {
  const { closing, handleClose } = useModalClose(onClose)
  const [name, setName] = useState(editBookmark?.name || '')
  const [url, setUrl] = useState(editBookmark?.link || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isEdit = Boolean(editBookmark)

  useEffect(() => {
    if (editBookmark) { setName(editBookmark.name); setUrl(editBookmark.link) }
    else { setName(''); setUrl('') }
  }, [editBookmark])

  async function handleSubmit() {
    if (!name || !url) { setError('Name and link are required.'); return }
    setLoading(true)
    try {
      if (isEdit) await bookmarksApi.update(editBookmark.id, { name, link: url, tags: editBookmark.tags || [] })
      else await bookmarksApi.create({ name, link: url, tags: [] })
      onSuccess?.()
      handleClose()
    } catch (e) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null
  return (
    <div className={`modal-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <img src="/images/arrow-left.svg" className="modal-back" alt="back" onClick={handleClose} />
        <div className="modal-title">{isEdit ? 'Edit bookmark' : 'Add a bookmark'}</div>
        <div className="modal-field">
          <span className="modal-field-tag">Name</span>
          <input
            className="modal-input"
            placeholder="e.g. Engineering docs"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="modal-field" style={{ marginBottom: 28 }}>
          <span className="modal-field-tag">URL</span>
          <input
            className="modal-input"
            placeholder="https://"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
        </div>
        {error && <div className="modal-error">{error}</div>}
        <button
          className={`modal-submit${loading ? ' disabled' : ''}`}
          onClick={handleSubmit}
          disabled={loading}
        >
          {isEdit ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default function Bookmarks() {
  const { token, email } = useAuth()
  const [user, setUser] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [pendingBookmarks, setPendingBookmarks] = useState([])
  const [deletedBookmarks, setDeletedBookmarks] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editBookmark, setEditBookmark] = useState(null)
  const [shareBookmark, setShareBookmark] = useState(null)
  const [deleteBookmark, setDeleteBookmark] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.documentElement.id = 'links_html'
    return () => { document.documentElement.id = '' }
  }, [])

  useEffect(() => {
    usersApi.me().then(setUser).catch(() => {})
    bookmarksApi.getAll().then(data => {
      if (data['bookmarks'] !== undefined) setBookmarks(data['bookmarks'] || [])
      if (data['pending-bookmarks'] !== undefined) setPendingBookmarks(data['pending-bookmarks'] || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleWsMessage = useCallback((data) => {
    if (data['bookmarks'] !== undefined) setBookmarks(data['bookmarks'] || [])
    if (data['pending-bookmarks'] !== undefined) setPendingBookmarks(data['pending-bookmarks'] || [])
    if (data['deleted-bookmarks'] !== undefined) setDeletedBookmarks(data['deleted-bookmarks'] || [])
  }, [])

  useWebSocket(email, token, handleWsMessage)

  const filtered = bookmarks.filter(b =>
    b.name?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleRestore(bm) {
    try { await linksApi.restore(bm.id, 'bookmark') } catch {}
  }

  async function permanentDelete(bm) {
    try { await linksApi.delete(bm.id, true, 'bookmark') } catch {}
  }

  return (
    <div id="page">
      <Header
        onSettings={() => setShowSettings(true)}
        onAdd={() => { setEditBookmark(null); setShowModal(true) }}
        page="bookmarks"
      />

      <div id="links-search-container">
        <input
          id="links-search"
          placeholder="Search for bookmarks"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {pendingBookmarks.length > 0 && (
        <div id="pending-links">
          <div style={{ fontWeight: 600, fontSize: 18, margin: '20px 0 10px', opacity: 0.7 }}>Pending Invitations</div>
          {pendingBookmarks.map(b => (
            <div key={b.id} className="link link_event pending-link">
              <div className="join-meeting">
                <div className="name">{b.name}</div>
                <div className="description">Bookmark invitation</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 10 }}>
                <button
                  className="pending-link-buttons accept"
                  onClick={async () => { try { await linksApi.accept(b, true, 'bookmark') } catch {} }}
                >Accept</button>
                <button
                  className="pending-link-buttons decline"
                  onClick={async () => { try { await linksApi.accept(b, false, 'bookmark') } catch {} }}
                >Decline</button>
              </div>
            </div>
          ))}
          <hr className="hr-pending-links" />
        </div>
      )}

      <div id="insert">
        {filtered.length === 0 && !loading && (
          <div className="no-links">
            <img src="/images/no-links-made.svg" alt="No bookmarks" />
            <div>Click the + button to add your first bookmark!</div>
          </div>
        )}
        {filtered.map(b => (
          <BookmarkCard
            key={b.id} bookmark={b}
            onEdit={bm => { setEditBookmark(bm); setShowModal(true) }}
            onShare={setShareBookmark}
            onDelete={setDeleteBookmark}
          />
        ))}
      </div>

      <img
        src="/images/plus-mobile.svg"
        className="plus"
        alt="Add bookmark"
        onClick={() => { setEditBookmark(null); setShowModal(true) }}
      />

      <BookmarkModal
        visible={showModal}
        editBookmark={editBookmark}
        onClose={() => { setShowModal(false); setEditBookmark(null) }}
        onSuccess={() => bookmarksApi.getAll().then(data => {
          if (data['bookmarks'] !== undefined) setBookmarks(data['bookmarks'] || [])
        }).catch(() => {})}
      />

      {shareBookmark && (
        <ShareModal
          link={shareBookmark}
          type="bookmark"
          onClose={() => setShareBookmark(null)}
        />
      )}

      {deleteBookmark && (
        <DeleteModal
          link={deleteBookmark}
          type="bookmark"
          onClose={() => setDeleteBookmark(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          user={user}
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          onShowDeleted={() => { setShowSettings(false); setShowDeleted(true) }}
          onUserRefresh={() => usersApi.me().then(setUser).catch(() => {})}
        />
      )}

      {showDeleted && (
        <div id="deleted-links" style={{ display: 'flex' }}>
          <div id="deleted-links-header">
            <img
              src="/images/arrow-left.svg"
              style={{ position: 'absolute', left: 10, top: '2%', cursor: 'pointer', height: 30 }}
              alt="back"
              onClick={() => setShowDeleted(false)}
            />
            <div style={{ fontSize: 24, fontWeight: 600, margin: 'auto' }}>Deleted Bookmarks</div>
          </div>
          <div id="deleted-links-body" className={deletedBookmarks.length === 0 ? 'empty' : ''}>
            {deletedBookmarks.length === 0 && (
              <img src="/images/no-links-made.svg" alt="Empty trash" />
            )}
            {deletedBookmarks.map(b => (
              <div key={b.id} className="link link_event" style={{ width: 'calc(94% - 100px)' }}>
                <div>{b.name}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="pending-link-buttons accept" onClick={() => handleRestore(b)}>Restore</button>
                  <button className="pending-link-buttons decline" onClick={() => permanentDelete(b)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
