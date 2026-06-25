import { linksApi } from '../api/links.js'
import { useState } from 'react'
import { useModalClose } from '../hooks/useModalClose.js'
import '../styles/modal.css'

export default function DeleteModal({ link, type = 'link', onClose }) {
  const { closing, handleClose } = useModalClose(onClose)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await linksApi.delete(link.id, false, type)
      handleClose(true)
    } catch {
      handleClose(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`modal-overlay${closing ? ' closing' : ''}`} onClick={() => handleClose(false)}>
      <div className="modal-card modal-confirm" onClick={e => e.stopPropagation()}>
        <div className="modal-confirm-title">Delete &ldquo;{link?.name}&rdquo;?</div>
        <div className="modal-confirm-sub">This can be recovered from deleted links in settings.</div>
        <div className="modal-confirm-buttons">
          <button className="modal-confirm-cancel" onClick={() => handleClose(false)}>
            Cancel
          </button>
          <button
            className={`modal-confirm-delete${loading ? ' disabled' : ''}`}
            onClick={handleDelete}
            disabled={loading}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
