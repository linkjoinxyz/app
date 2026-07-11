import { useState, useEffect, useCallback } from 'react'

function getPreferred() {
  const stored = localStorage.getItem('lj_theme')
  if (stored === 'light') return false
  if (stored === 'dark') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
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
