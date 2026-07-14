import { useState, useEffect, useCallback } from 'react'

function getPreferred() {
  // Dark is the only supported theme now — the toggle UI was removed from
  // the main app shell (SideNav), but a stale localStorage value or a
  // light-preferring OS could otherwise strand someone in an unreachable
  // light mode with no way back. Always dark, regardless of either.
  return true
}

function applyTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const val = getPreferred()
    applyTheme(val)
    return val
  })

  useEffect(() => {
    applyTheme(isDark)
  }, [isDark])

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      localStorage.setItem('lj_theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  return { isDark, toggle }
}
