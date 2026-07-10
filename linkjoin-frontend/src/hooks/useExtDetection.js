import { useState, useEffect } from 'react'

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/add-to-linkjoin/mhncphjlaeeglmjpgdmclklebdfomele'

function getBrowser() {
  const ua = navigator.userAgent
  if (ua.includes('Firefox')) return 'firefox'
  if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) return 'chrome'
  return 'other'
}

export function useExtDetection() {
  const browser = getBrowser()
  const [installed, setInstalled] = useState(() => !!window.__lj_ext)
  const [checked, setChecked] = useState(() => !!window.__lj_ext)

  useEffect(() => {
    if (window.__lj_ext) { setInstalled(true); setChecked(true); return }
    let alive = true
    const handler = () => { if (alive) { setInstalled(true); setChecked(true) } }
    window.addEventListener('lj:ready', handler)
    const t = setTimeout(() => { if (alive) setChecked(true) }, 1500)
    return () => { alive = false; window.removeEventListener('lj:ready', handler); clearTimeout(t) }
  }, [])

  const installUrl = browser === 'chrome' ? CHROME_STORE_URL : null

  return { installed, checked, browser, installUrl }
}
