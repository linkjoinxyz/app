const BASE_URL = 'http://localhost:8000'
const APP_URL = 'http://localhost:5173'

async function getAuth() {
    const { token, email } = await chrome.storage.local.get(['token', 'email'])
    return token && email ? { token, email } : null
}

async function apiFetch(path, options = {}) {
    const auth = await getAuth()
    if (!auth) return null
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.token}`,
                ...(options.headers || {}),
            },
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}


function nextOccurrence(link) {
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const parts = (link.time || '0:00').split(':')
    const hour = parseInt(parts[0])
    const minute = parseInt(parts[1] || '0')
    if (isNaN(hour) || isNaN(minute)) return null

    let earliest = null
    for (const day of link.days) {
        const today = new Date()
        const d = new Date(today)
        const daysUntil = (7 - (today.getDay() - DAYS.indexOf(day))) % 7
        d.setDate(d.getDate() + daysUntil)

        const alreadyPassed =
            (hour < today.getHours() ||
                (hour === today.getHours() && minute <= today.getMinutes())) &&
            daysUntil === 0
        if (alreadyPassed) d.setDate(d.getDate() + 7)
        d.setHours(hour, minute, 0, 0)

        if (!earliest || d < earliest) earliest = d
    }
    return earliest
}

function formatNext(date) {
    if (!date) return ''
    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.round((dateMidnight - todayMidnight) / (1000 * 60 * 60 * 24))
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    if (diffDays === 0) return `Today at ${timeStr}`
    if (diffDays === 1) return `Tomorrow at ${timeStr}`
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
    return `${dayName} at ${timeStr}`
}

// --- Render functions ---

function renderLogin() {
    chrome.tabs.create({ url: `${APP_URL}/login` })
    document.getElementById('app').innerHTML = `
        <div class="header">
            <img src="/icons/logo-rounded.png" class="logo-icon" alt="">
            <span class="logo-text">LinkJoin</span>
        </div>
        <div class="login-form">
            <p class="subtitle">Opening sign-in page&hellip;</p>
        </div>
    `
}

// --- Settings ---

async function renderSettings() {
    const { ljAutoDetect = true } = await chrome.storage.local.get('ljAutoDetect')
    document.getElementById('app').innerHTML = `
        <div class="header">
            <button class="back-btn" id="back-btn">&#8592;</button>
            <span class="logo-text">Settings</span>
        </div>
        <div class="settings-body">
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Auto-detect meetings</div>
                    <div class="setting-desc">Show overlay when a meeting link is found in Gmail or Outlook</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="auto-detect-toggle" ${ljAutoDetect ? 'checked' : ''}>
                    <span class="toggle-track"></span>
                </label>
            </div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Reset dismissed</div>
                    <div class="setting-desc">Re-show overlays for meetings dismissed this session</div>
                </div>
                <button class="text-btn" id="reset-dismissed-btn">Reset</button>
            </div>
        </div>
    `
    document.getElementById('back-btn').addEventListener('click', () => renderDashboard())
    document.getElementById('auto-detect-toggle').addEventListener('change', async e => {
        await chrome.storage.local.set({ ljAutoDetect: e.target.checked })
    })
    document.getElementById('reset-dismissed-btn').addEventListener('click', () => {
        const btn = document.getElementById('reset-dismissed-btn')
        chrome.runtime.sendMessage({ type: 'resetDismissed' })
        btn.textContent = 'Done!'
        setTimeout(() => { if (btn.isConnected) btn.textContent = 'Reset' }, 1500)
    })
}

// --- Dashboard ---

async function renderDashboard() {
    const auth = await getAuth()
    document.getElementById('app').innerHTML = `
        <div class="header">
            <img src="/icons/logo-rounded.png" class="logo-icon" alt="">
            <span class="logo-text">LinkJoin</span>
            <button id="dashboard-btn">Dashboard</button>
            <button id="logout-btn">Log out</button>
            <button class="gear-btn" id="settings-btn" aria-label="Settings">
                <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor">
                    <path d="M471.46,212.99l-42.07-7.92c-3.63-12.37-8.58-24.3-14.79-35.64l24.16-35.37c4.34-6.35,3.54-14.9-1.9-20.34l-38.58-38.58c-5.44-5.44-13.99-6.24-20.34-1.9L342.57,97.4c-11.34-6.21-23.27-11.16-35.64-14.78l-7.92-42.07c-1.42-7.56-8.03-13.04-15.72-13.04h-54.57c-7.69,0-14.3,5.48-15.72,13.04l-7.92,42.07c-12.37,3.63-24.3,8.58-35.64,14.78l-35.37-24.16c-6.35-4.34-14.9-3.54-20.34,1.9l-38.58,38.58c-5.44,5.44-6.24,13.98-1.9,20.34l24.16,35.37c-6.21,11.34-11.16,23.27-14.79,35.64l-42.07,7.92c-7.56,1.42-13.04,8.03-13.04,15.72v54.57c0,7.69,5.48,14.3,13.04,15.72l42.07,7.92c3.63,12.37,8.58,24.3,14.79,35.64l-24.16,35.37c-4.34,6.35-3.54,14.9,1.9,20.34l38.58,38.58c5.44,5.44,13.99,6.24,20.34,1.9l35.37-24.16c11.34,6.21,23.27,11.16,35.64,14.79l7.92,42.07c1.42,7.56,8.03,13.04,15.72,13.04h54.57c7.69,0,14.3-5.48,15.72-13.04l7.92-42.07c12.37-3.63,24.3-8.58,35.64-14.79l35.37,24.16c6.35,4.34,14.9,3.54,20.34-1.9l38.58-38.58c5.44-5.44,6.24-13.98,1.9-20.34l-24.16-35.37c6.21-11.34,11.16-23.27,14.79-35.64l42.07-7.92c7.56-1.42,13.04-8.03,13.04-15.72v-54.57C484.5,221.02,479.02,214.42,471.46,212.99z M452.5,270.01l-38.98,7.34c-6.25,1.18-11.21,5.94-12.63,12.14c-3.69,16.02-10,31.25-18.77,45.25c-3.37,5.39-3.24,12.26,0.35,17.51l22.39,32.78l-19.82,19.82l-32.78-22.39c-5.25-3.59-12.12-3.73-17.51-0.35c-14.01,8.77-29.24,15.08-45.25,18.77c-6.2,1.43-10.96,6.38-12.14,12.63l-7.34,38.98h-28.03l-7.34-38.98c-1.18-6.25-5.94-11.21-12.14-12.63c-16.02-3.69-31.24-10-45.25-18.77c-5.39-3.37-12.26-3.24-17.51,0.35l-32.78,22.39l-19.82-19.82l22.39-32.78c3.59-5.25,3.72-12.12,0.35-17.51c-8.77-14.01-15.08-29.24-18.77-45.25c-1.43-6.2-6.38-10.96-12.63-12.14l-38.98-7.34v-28.03l38.98-7.34c6.25-1.18,11.21-5.94,12.63-12.14c3.69-16.02,10-31.25,18.77-45.25c3.37-5.39,3.24-12.26-0.35-17.51l-22.39-32.78l19.82-19.82l32.78,22.39c5.25,3.58,12.12,3.72,17.51,0.35c14.01-8.77,29.24-15.08,45.25-18.77c6.2-1.43,10.96-6.38,12.14-12.63l7.34-38.98h28.03l7.34,38.98c1.18,6.25,5.94,11.21,12.14,12.63c16.02,3.69,31.24,10,45.25,18.77c5.39,3.37,12.26,3.24,17.51-0.35l32.78-22.39l19.82,19.82l-22.39,32.78c-3.59,5.25-3.72,12.12-0.35,17.51c8.77,14.01,15.08,29.24,18.77,45.25c1.43,6.2,6.38,10.96,12.63,12.14l38.98,7.34V270.01z"/>
                    <path d="M256,148.26c-59.41,0-107.74,48.33-107.74,107.74c0,59.41,48.33,107.74,107.74,107.74S363.74,315.41,363.74,256C363.74,196.59,315.41,148.26,256,148.26z M256,331.74c-41.76,0-75.74-33.98-75.74-75.74c0-41.76,33.98-75.74,75.74-75.74s75.74,33.98,75.74,75.74C331.74,297.76,297.76,331.74,256,331.74z"/>
                </svg>
            </button>
        </div>
        <div class="user-email">${escHtml(auth.email)}</div>
        <div class="meetings-section">
            <div class="section-label">Upcoming meetings</div>
            <div id="meetings-list"><p class="muted-msg">Loading...</p></div>
        </div>
    `
    document.getElementById('dashboard-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: `${APP_URL}/links` })
    })
    document.getElementById('logout-btn').addEventListener('click', handleLogout)
    document.getElementById('settings-btn').addEventListener('click', renderSettings)

    const data = await apiFetch('/links')
    const list = document.getElementById('meetings-list')
    if (!list) return  // user navigated away while fetch was in-flight

    if (!data?.links) {
        list.innerHTML = '<p class="muted-msg">Could not load meetings.</p>'
        return
    }

    const upcoming = data.links
        .filter(l => l.days?.length)
        .map(l => ({ ...l, _next: nextOccurrence(l) }))
        .filter(l => l._next)
        .sort((a, b) => a._next - b._next)

    if (upcoming.length === 0) {
        list.innerHTML = '<p class="muted-msg">No upcoming meetings.</p>'
        return
    }

    list.innerHTML = upcoming.map(l => `
        <div class="meeting-card">
            <div class="meeting-name">${escHtml(l.name)}</div>
            <div class="meeting-meta">
                <span class="meeting-days">${l.days.map(escHtml).join(', ')}</span>
                <span class="meeting-next">${formatNext(l._next)}</span>
            </div>
        </div>
    `).join('')
}

async function handleLogout() {
    await chrome.storage.local.remove(['token', 'email', 'links', 'alarmData'])
    chrome.runtime.sendMessage({ type: 'logout' })
    renderLogin()
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// --- Init ---

async function init() {
    const auth = await getAuth()
    if (auth) {
        await renderDashboard()
    } else {
        renderLogin()
    }
}

init()
