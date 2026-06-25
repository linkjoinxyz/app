import { useState, useCallback } from 'react'

export function useModalClose(onClose, delay = 160) {
  const [closing, setClosing] = useState(false)

  const handleClose = useCallback((...args) => {
    setClosing(true)
    setTimeout(() => onClose(...args), delay)
  }, [onClose, delay])

  return { closing, handleClose }
}
