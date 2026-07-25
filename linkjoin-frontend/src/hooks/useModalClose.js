import { useState, useCallback, useEffect, useRef } from 'react'
import { useFocusTrap } from './useFocusTrap.js'

// Modal behavior in one hook: the closing-animation flag plus the accessibility
// contract (focus trap, focus restore, Escape-to-close, dialog semantics).
//
// Attach the returned overlayRef and dialogProps to the modal's content
// element, and point aria-labelledby at the title:
//
//   const { closing, handleClose, overlayRef, dialogProps } = useModalClose(onClose)
//   <div className="modal-overlay" onClick={handleClose}>
//     <div className="modal" ref={overlayRef} {...dialogProps} aria-labelledby="my-title"
//          onClick={e => e.stopPropagation()}>
//       <h2 id="my-title">…</h2>
export function useModalClose(onClose, delay = 160) {
  const [closing, setClosing] = useState(false)
  const overlayRef = useRef(null)

  const handleClose = useCallback((...args) => {
    setClosing(true)
    setTimeout(() => onClose(...args), delay)
  }, [onClose, delay])

  // Trap Tab within the modal and restore focus to the opener on unmount.
  useFocusTrap(overlayRef, true)

  // Escape closes the modal. Scoped to the modal element (focus lives inside it
  // once the trap runs), so it does not swallow Escape for the rest of the app.
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); handleClose() }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [handleClose])

  const dialogProps = { role: 'dialog', 'aria-modal': true, tabIndex: -1 }
  return { closing, handleClose, overlayRef, dialogProps }
}
