import { useEffect } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    const focusable = [...el.querySelectorAll(FOCUSABLE)].filter(n => !n.closest('[hidden]'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    const prev = document.activeElement
    first?.focus()

    function onKey(e) {
      if (e.key !== 'Tab') return
      if (!focusable.length) { e.preventDefault(); return }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }

    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [active, ref])
}
