import { useState, useEffect } from 'react'

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/add-to-linkjoin/mhncphjlaeeglmjpgdmclklebdfomele'
const FIREFOX_ADDON_URL = ''

function getBrowser() {
  const ua = navigator.userAgent
  if (ua.includes('Firefox')) return 'firefox'
  if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) return 'chrome'
  return 'other'
}

export default function OnboardingCard({ onAddManually, onImportGoogle, onImportOutlook }) {
  const [extInstalled, setExtInstalled] = useState(false)
  const [checking, setChecking] = useState(true)
  const browser = getBrowser()

  useEffect(() => {
    if (window.__lj_ext) {
      setExtInstalled(true)
      setChecking(false)
      return
    }
    let alive = true
    const handler = () => { if (alive) { setExtInstalled(true); setChecking(false) } }
    window.addEventListener('lj:ready', handler)
    const timer = setTimeout(() => { if (alive) setChecking(false) }, 1500)
    return () => {
      alive = false
      window.removeEventListener('lj:ready', handler)
      clearTimeout(timer)
    }
  }, [])

  const showExtStatus = extInstalled || !checking
  const installUrl = browser === 'firefox' ? FIREFOX_ADDON_URL : CHROME_STORE_URL
  const installLabel = browser === 'firefox' ? 'Add to Firefox' : 'Add to Chrome'
  const sectionLabel = browser === 'firefox' ? 'Firefox Extension' : 'Chrome Extension'

  return (
    <div className="ob-card">
      <div className="ob-greeting">
        <div className="ob-title">Welcome to LinkJoin</div>
        <div className="ob-subtitle">Add your meetings and they'll open automatically.</div>
      </div>

      {browser !== 'other' && (
      <div className="ob-section">
        <div className="ob-section-label">{sectionLabel}</div>
        <div className="ob-section-desc">The extension is required for meetings to open automatically without keeping a browser tab open.</div>
        {showExtStatus && (
          extInstalled ? (
            <div className="ob-ext-status ob-ext-ok">
              <span className="ob-dot ob-dot-ok" />
              Extension installed
            </div>
          ) : (
            <div className="ob-ext-row">
              <div className="ob-ext-status ob-ext-missing">
                <span className="ob-dot ob-dot-missing" />
                Not detected
              </div>
              {installUrl && (
                <a className="ob-ext-btn" href={installUrl} target="_blank" rel="noopener noreferrer">
                  {installLabel}
                </a>
              )}
            </div>
          )
        )}
      </div>
      )}

      {browser !== 'other' && <div className="ob-divider" />}

      <div className="ob-section">
        <div className="ob-section-label">Add Your First Meeting</div>
        <button className="ob-action-btn ob-import" onClick={onImportGoogle}>
          Import Google Calendar
        </button>
        <button className="ob-action-btn ob-import" onClick={onImportOutlook}>
          Import Outlook Calendar
        </button>
        <button className="ob-action-btn ob-manual" onClick={onAddManually}>
          + Add Manually
        </button>
      </div>
    </div>
  )
}
