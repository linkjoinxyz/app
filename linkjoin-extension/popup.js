const BASE_URL = 'http://localhost:8000'
const APP_URL = 'http://localhost:5173'

const MEETING_RE = /https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us\/j\/|meet\.google\.com\/[a-z-]{3,}|teams\.microsoft\.com\/l\/meetup-join\/|webex\.com\/meet\/|gotomeeting\.com\/join\/)[^\s"'<>]*/i

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

function _to24h(hour, min, period) {
    let h = parseInt(hour)
    const m = parseInt(min) || 0
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return `${h}:${String(m).padStart(2, '0')}`
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// --- Scan flow ---

async function handleScan() {
    const app = document.getElementById('app')
    app.innerHTML = `
        <div class="header">
            <button class="back-btn" id="back-btn">&#8592;</button>
            <span class="logo-text">Scan this page</span>
        </div>
        <div class="scan-status"><span class="spinner"></span> Scanning…</div>
    `
    document.getElementById('back-btn').addEventListener('click', () => renderDashboard())

    let found = null
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const RE = /https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us\/j\/|meet\.google\.com\/[a-z-]{3,}|teams\.microsoft\.com\/l\/meetup-join\/|webex\.com\/meet\/|gotomeeting\.com\/join\/)[^\s"'<>]*/i
                for (const a of document.querySelectorAll('a[href]')) {
                    if (RE.test(a.href)) return { link: a.href, title: document.title, text: document.body.innerText.slice(0, 4000) }
                }
                const m = document.body.innerText.match(RE)
                if (m) return { link: m[0], title: document.title, text: document.body.innerText.slice(0, 4000) }
                return null
            },
        })
        found = results?.[0]?.result
    } catch (e) {
        renderScanError('Could not scan this page. Try navigating to the page first.')
        return
    }

    if (!found) {
        renderScanError('No meeting link found on this page.')
        return
    }

    // Show loading while AI extracts info
    app.querySelector('.scan-status').innerHTML = '<span class="spinner"></span> Extracting meeting info…'

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const aiResult = await new Promise(resolve => {
        chrome.runtime.sendMessage(
            { type: 'extractMeeting', subject: found.title, body: found.text, timezone },
            result => resolve(result || {})
        )
    })

    renderAddForm(found.link, aiResult)
}

function renderScanError(msg) {
    const app = document.getElementById('app')
    app.innerHTML = `
        <div class="header">
            <button class="back-btn" id="back-btn">&#8592;</button>
            <span class="logo-text">Scan this page</span>
        </div>
        <div class="scan-empty">
            <div class="scan-empty-icon">&#128269;</div>
            <div class="scan-empty-msg">${escHtml(msg)}</div>
            <button class="scan-manual-btn" id="manual-btn">Add manually</button>
        </div>
    `
    document.getElementById('back-btn').addEventListener('click', () => renderDashboard())
    document.getElementById('manual-btn').addEventListener('click', () => renderAddForm('', {}))
}

// --- Add form ---

function renderAddForm(detectedLink, prefilled) {
    const DAYS_ALL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const preDays = prefilled.days || []
    const preRepeat = prefilled.repeats || 'week'

    // Parse prefilled time
    let preHour = '', preMin = '00', prePeriod = 'AM'
    if (prefilled.time) {
        const [h, m] = prefilled.time.split(':').map(Number)
        prePeriod = h >= 12 ? 'PM' : 'AM'
        preHour = h === 0 ? '12' : h > 12 ? String(h - 12) : String(h)
        preMin = String(m || 0).padStart(2, '0')
    }

    const isMonth = preRepeat === 'month'

    document.getElementById('app').innerHTML = `
        <div class="header">
            <button class="back-btn" id="back-btn">&#8592;</button>
            <span class="logo-text">Add meeting</span>
        </div>
        <div class="add-form">
            <div class="add-field">
                <label class="add-label">Name <span class="req">*</span></label>
                <input id="add-name" class="add-input" type="text" placeholder="Weekly Sync"
                    value="${escHtml(prefilled.name || '')}">
            </div>
            <div class="add-field">
                <label class="add-label">Link <span class="req">*</span></label>
                <input id="add-link" class="add-input" type="url" placeholder="https://zoom.us/j/..."
                    value="${escHtml(detectedLink)}">
            </div>
            <div class="add-field">
                <label class="add-label">Repeat</label>
                <select id="add-repeat" class="add-select">
                    <option value="never" ${preRepeat==='never'?'selected':''}>One time</option>
                    <option value="week" ${preRepeat==='week'?'selected':''}>Weekly</option>
                    <option value="2 times" ${preRepeat==='2 times'?'selected':''}>Every 2 weeks</option>
                    <option value="month" ${preRepeat==='month'?'selected':''}>Monthly</option>
                </select>
            </div>
            <div class="add-field" id="days-field" style="${isMonth ? 'display:none' : ''}">
                <label class="add-label">Days <span class="req">*</span></label>
                <div class="day-pills" id="day-pills">
                    ${DAYS_ALL.map(d => `<button class="day-pill${preDays.includes(d) ? ' active' : ''}" data-day="${d}">${d}</button>`).join('')}
                </div>
            </div>
            <div class="add-field">
                <label class="add-label">Time <span class="req">*</span></label>
                <div class="time-row">
                    <input id="add-hour" class="add-input time-input" type="number" min="1" max="12" placeholder="10" value="${escHtml(preHour)}">
                    <span class="time-colon">:</span>
                    <input id="add-min" class="add-input time-input" type="number" min="0" max="59" placeholder="00" value="${escHtml(preMin)}">
                    <button class="period-btn" id="add-period">${prePeriod}</button>
                </div>
            </div>
            <div id="add-error" class="add-error" style="display:none"></div>
            <button class="add-submit" id="add-submit" disabled>Add to LinkJoin</button>
        </div>
    `

    document.getElementById('back-btn').addEventListener('click', () => renderDashboard())

    document.getElementById('add-repeat').addEventListener('change', e => {
        document.getElementById('days-field').style.display = e.target.value === 'month' ? 'none' : ''
        updateAddState()
    })

    document.getElementById('day-pills').addEventListener('click', e => {
        const pill = e.target.closest('.day-pill')
        if (pill) { pill.classList.toggle('active'); updateAddState() }
    })

    document.getElementById('add-period').addEventListener('click', () => {
        const btn = document.getElementById('add-period')
        btn.textContent = btn.textContent === 'AM' ? 'PM' : 'AM'
    })

    ;['add-name', 'add-link', 'add-hour'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateAddState)
    })

    document.getElementById('add-submit').addEventListener('click', submitAdd)

    updateAddState()
}

function updateAddState() {
    const name = document.getElementById('add-name').value.trim()
    const link = document.getElementById('add-link').value.trim()
    const hour = document.getElementById('add-hour').value.trim()
    const repeat = document.getElementById('add-repeat').value
    const days = [...document.querySelectorAll('.day-pill.active')]
    const valid = name && link && hour && (repeat === 'month' || days.length > 0)
    document.getElementById('add-submit').disabled = !valid
}

async function submitAdd() {
    const name = document.getElementById('add-name').value.trim()
    const link = document.getElementById('add-link').value.trim()
    const hourVal = document.getElementById('add-hour').value.trim()
    const minVal = document.getElementById('add-min').value.trim() || '00'
    const period = document.getElementById('add-period').textContent
    const repeat = document.getElementById('add-repeat').value
    const errorEl = document.getElementById('add-error')
    const btn = document.getElementById('add-submit')

    let days
    if (repeat === 'month') {
        days = []
    } else {
        days = [...document.querySelectorAll('.day-pill.active')].map(p => p.dataset.day)
    }

    if (!name || !link || !hourVal || (repeat !== 'month' && !days.length)) return

    const time = _to24h(hourVal, minVal, period)

    btn.textContent = 'Adding…'
    btn.disabled = true
    errorEl.style.display = 'none'

    const response = await new Promise(resolve => {
        chrome.runtime.sendMessage(
            { type: 'createLink', data: { name, link, time, days, repeats: repeat, text: 'false', activated: true } },
            resolve
        )
    })

    if (response?.ok) {
        btn.textContent = 'Added!'
        btn.classList.add('success')
        setTimeout(() => renderDashboard(), 1500)
    } else {
        errorEl.textContent = 'Failed to add. Make sure you\'re logged in.'
        errorEl.style.display = 'block'
        btn.textContent = 'Add to LinkJoin'
        btn.disabled = false
    }
}

// --- Dashboard ---

function renderLogin() {
    chrome.tabs.create({ url: `${APP_URL}/login` })
    document.getElementById('app').innerHTML = `
        <div class="header">
            <img src="/icons/logo-rounded.png" class="logo-icon" alt="">
            <span class="logo-text">LinkJoin</span>
        </div>
        <div class="login-form">
            <p class="subtitle">Opening sign-in page…</p>
        </div>
    `
}

async function renderDashboard() {
    const auth = await getAuth()
    document.getElementById('app').innerHTML = `
        <div class="header">
            <img src="/icons/logo-rounded.png" class="logo-icon" alt="">
            <span class="logo-text">LinkJoin</span>
            <button id="dashboard-btn">Dashboard</button>
            <button id="logout-btn">Log out</button>
        </div>
        <div class="user-email">${escHtml(auth.email)}</div>
        <button class="scan-btn" id="scan-btn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="6" cy="6" r="4.5"/>
                <line x1="9.5" y1="9.5" x2="13" y2="13"/>
            </svg>
            Scan this page
        </button>
        <div class="meetings-section">
            <div class="section-label">Upcoming meetings</div>
            <div id="meetings-list"><p class="muted-msg">Loading...</p></div>
        </div>
    `
    document.getElementById('dashboard-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: `${APP_URL}/links` })
    })
    document.getElementById('logout-btn').addEventListener('click', handleLogout)
    document.getElementById('scan-btn').addEventListener('click', handleScan)

    const data = await apiFetch('/links')
    const list = document.getElementById('meetings-list')

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
                <span class="meeting-days">${l.days.join(', ')}</span>
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
