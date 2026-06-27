const BASE_URL = 'http://localhost:8000'
const APP_URL = 'http://localhost:5173'

const MEETING_RE = /https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us\/j\/|meet\.google\.com\/[a-z-]{3,}|teams\.microsoft\.com\/l\/meetup-join\/|webex\.com\/meet\/|gotomeeting\.com\/join\/)[^\s"'<>]*/i

const DAYS_ALL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REPEAT_OPTIONS = ['never', 'week', 'month', '2 times', '3 times', '4 times']
const REPEAT_LABELS = {
    never: 'One-time', week: 'Weekly', month: 'Same date every month',
    '2 times': 'Every 2 weeks', '3 times': 'Every 3 weeks', '4 times': 'Every 4 weeks',
}
const REMINDER_OPTIONS = [
    { value: 'false', label: 'Never' },
    { value: '5',     label: '5 min before' },
    { value: '10',    label: '10 min before' },
    { value: '15',    label: '15 min before' },
    { value: '30',    label: '30 min before' },
    { value: '60',    label: '1 hour before' },
]

function normalizeRepeat(r) {
    if (!r) return 'never'
    if (REPEAT_OPTIONS.includes(r)) return r
    if (/^day \d+$/.test(r) || r === 'same_weekday') return r
    return 'never'
}

function repeatLabel(r) {
    if (r === 'same_weekday') return 'Same date every month'
    if (REPEAT_LABELS[r]) return REPEAT_LABELS[r]
    if (/^day \d+$/.test(r)) {
        const n = parseInt(r.split(' ')[1])
        const s = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
        return `${n}${s} of month`
    }
    return r
}

function _to12h(time24) {
    if (!time24 || !time24.includes(':')) return { h: '', m: '', period: 'AM' }
    const [hStr, mStr] = time24.split(':')
    let h = parseInt(hStr) || 0
    const m = String(parseInt(mStr) || 0).padStart(2, '0')
    const period = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return { h: String(h), m, period }
}

function _dateFmt(d) {
    if (!d) return ''
    let i = 0, out = ''
    const m0 = d[0]
    if (m0 >= '2') { out = m0 + '/'; i = 1 }
    else if (d.length > 1) {
        const raw = d.slice(0, 2), n = parseInt(raw)
        out = (n < 1 ? '01' : n > 12 ? '12' : raw) + '/'; i = 2
    } else { return m0 }
    if (i >= d.length) return out
    const day0 = d[i]
    if (day0 >= '4') { out += day0 + '/'; i++ }
    else if (d.length > i + 1) {
        const raw = d.slice(i, i + 2), n = parseInt(raw)
        out += (n < 1 ? '01' : n > 31 ? '31' : raw) + '/'; i += 2
    } else { return out + day0 }
    if (i >= d.length) return out
    out += d.slice(i, i + 4)
    return out
}

function _dateFmtSimple(d) {
    let v = d
    if (d.length > 2) v = d.slice(0, 2) + '/' + d.slice(2)
    if (d.length > 4) v = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4)
    return v
}

function _dateExpandYear(val) {
    const p = val.split('/')
    if (p.length === 3 && /^\d{2}$/.test(p[2])) return p[0] + '/' + p[1] + '/20' + p[2]
    return val
}

function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
                const title = document.title
                // Prefer the reading-pane area if on Outlook
                const scope = document.querySelector('[role="main"]') || document.body
                for (const a of scope.querySelectorAll('a[href]')) {
                    if (RE.test(a.href)) return { link: a.href, title, text: scope.innerText.slice(0, 8000) }
                }
                const m = scope.innerText.match(RE)
                if (m) return { link: m[0].startsWith('http') ? m[0] : 'https://' + m[0], title, text: scope.innerText.slice(0, 8000) }
                return null
            },
        })
        found = results?.[0]?.result
    } catch (e) {
        console.error('[LJ scan error]', e)
        renderScanError(`Could not scan this page: ${e?.message || e}`)
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

// --- Add form (same UI as the Gmail overlay) ---

function renderAddForm(detectedLink, prefilled) {
    const name = prefilled.name || ''
    const link = prefilled.link || detectedLink || ''
    const t12 = _to12h(prefilled.time || '')
    const date = prefilled.date || ''
    const repeat = normalizeRepeat(prefilled.repeat || prefilled.repeats)

    const dayPills = DAYS_ALL.map(d => {
        const active = Array.isArray(prefilled.days) && prefilled.days.includes(d)
        return `<button class="lj-day-pill${active ? ' active' : ''}" data-day="${d}">${d}</button>`
    }).join('')

    const repeatOptions = [...REPEAT_OPTIONS, ...(/^day \d+$/.test(repeat) || repeat === 'same_weekday' ? [repeat] : [])]
        .map(v => `<option value="${v}"${v === repeat ? ' selected' : ''}>${repeatLabel(v)}</option>`).join('')

    const el = document.getElementById('app')
    el.innerHTML = `
        <div class="header">
            <button class="back-btn" id="back-btn">&#8592;</button>
            <span class="logo-text">Add meeting</span>
        </div>
        <div class="lj-body" style="overflow-y:auto;max-height:420px">
            <label class="lj-label">Name <span class="lj-req">*</span></label>
            <input class="lj-input${!name ? ' lj-missing' : ''}" id="lj-name" type="text"
                value="${escAttr(name)}" placeholder="Meeting name">

            <label class="lj-label">Meeting link <span class="lj-req">*</span></label>
            <input class="lj-input${!link ? ' lj-missing' : ''}" id="lj-link" type="url"
                value="${escAttr(link)}" placeholder="https://zoom.us/j/...">

            <div id="lj-days-section"${repeat === 'month' ? ' style="display:none"' : ''}>
                <label class="lj-label">Days <span class="lj-req">*</span></label>
                <div class="lj-days${!Array.isArray(prefilled.days) || !prefilled.days.length ? ' lj-missing-days' : ''}" id="lj-days">
                    ${dayPills}
                </div>
            </div>

            <label class="lj-label">Time <span class="lj-req">*</span></label>
            <div class="lj-time-row">
                <input class="lj-input lj-time-part${!t12.h ? ' lj-missing' : ''}" id="lj-hour" type="text" placeholder="12" maxlength="2" value="${escAttr(t12.h)}">
                <span class="lj-time-colon">:</span>
                <input class="lj-input lj-time-part" id="lj-min" type="text" placeholder="00" maxlength="2" value="${escAttr(t12.m)}">
                <button class="lj-period-btn" id="lj-period" type="button">${escAttr(t12.period)}</button>
            </div>

            <label class="lj-label">Repeat</label>
            <select class="lj-select" id="lj-repeat">${repeatOptions}</select>

            <label class="lj-label">Start date <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#6b8fac;font-size:10px">(optional)</span></label>
            <input class="lj-input" id="lj-date" type="text" placeholder="MM/DD/YYYY" value="${escAttr(date)}">

            <label class="lj-label">Text reminder</label>
            <select class="lj-select" id="lj-reminder">${REMINDER_OPTIONS.map(o =>
                `<option value="${o.value}">${o.label}</option>`).join('')}</select>

            <div class="lj-error" id="lj-error" style="display:none"></div>
            <button class="lj-submit" id="lj-submit">Add to LinkJoin</button>
        </div>
    `

    document.getElementById('back-btn').addEventListener('click', () => renderDashboard())

    el.querySelector('#lj-repeat').addEventListener('change', () => {
        el.querySelector('#lj-days-section').style.display = el.querySelector('#lj-repeat').value === 'month' ? 'none' : ''
        updateSubmitState(el)
    })

    el.querySelectorAll('.lj-day-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            pill.classList.toggle('active')
            updateDaysMissing(el)
            updateSubmitState(el)
        })
    })

    const hourInp = el.querySelector('#lj-hour')
    const minInp = el.querySelector('#lj-min')
    const periodBtn = el.querySelector('#lj-period')

    hourInp.addEventListener('keydown', e => {
        if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) return
        if (!/^\d$/.test(e.key)) { e.preventDefault(); return }
        const k = parseInt(e.key)
        const val = hourInp.value.replace(/\D/g, '')
        const allSel = hourInp.selectionStart === 0 && hourInp.selectionEnd === hourInp.value.length
        if (allSel) { if (k === 0) { e.preventDefault(); return } }
        else {
            if (val.length === 0 && k === 0) { e.preventDefault(); return }
            if (val.length === 1 && val[0] === '1' && k > 2) { e.preventDefault(); return }
            if (val.length >= 2) { e.preventDefault(); return }
        }
    })
    hourInp.addEventListener('input', e => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 2)
        e.target.value = val
        hourInp.classList.toggle('lj-missing', !val)
        updateSubmitState(el)
        if ((val.length === 1 && parseInt(val) >= 2) || val.length === 2) { minInp.focus(); minInp.select() }
    })

    minInp.addEventListener('keydown', e => {
        if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) return
        if (!/^\d$/.test(e.key)) { e.preventDefault(); return }
        const k = parseInt(e.key)
        const val = minInp.value.replace(/\D/g, '')
        const allSel = minInp.selectionStart === 0 && minInp.selectionEnd === minInp.value.length
        if (allSel) { if (k > 5) { e.preventDefault(); return } }
        else {
            if (val.length === 0 && k > 5) { e.preventDefault(); return }
            if (val.length >= 2) { e.preventDefault(); return }
        }
    })
    minInp.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2)
        updateSubmitState(el)
    })

    periodBtn.addEventListener('click', () => {
        periodBtn.textContent = periodBtn.textContent === 'AM' ? 'PM' : 'AM'
    })

    const dateInp = el.querySelector('#lj-date')
    dateInp.addEventListener('input', e => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
        const isDel = e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward'
        e.target.value = isDel ? _dateFmtSimple(digits) : _dateFmt(digits)
    })
    dateInp.addEventListener('blur', e => { e.target.value = _dateExpandYear(e.target.value) })

    ;['lj-name', 'lj-link'].forEach(id => {
        el.querySelector(`#${id}`).addEventListener('input', () => {
            const inp = el.querySelector(`#${id}`)
            inp.classList.toggle('lj-missing', !inp.value.trim())
            updateSubmitState(el)
        })
    })

    el.querySelector('#lj-submit').addEventListener('click', () => handleAddSubmit(el))
    updateSubmitState(el)
}

function updateDaysMissing(el) {
    const container = el.querySelector('#lj-days')
    container.classList.toggle('lj-missing-days', !container.querySelectorAll('.lj-day-pill.active').length)
}

function updateSubmitState(el) {
    const name = el.querySelector('#lj-name').value.trim()
    const link = el.querySelector('#lj-link').value.trim()
    const hour = el.querySelector('#lj-hour').value.trim()
    const repeat = el.querySelector('#lj-repeat').value
    const days = [...el.querySelectorAll('.lj-day-pill.active')]
    el.querySelector('#lj-submit').disabled = !(name && link && hour && (repeat === 'month' || days.length > 0))
}

async function handleAddSubmit(el) {
    const name = el.querySelector('#lj-name').value.trim()
    const link = el.querySelector('#lj-link').value.trim()
    const hourVal = el.querySelector('#lj-hour').value.trim()
    const minVal = el.querySelector('#lj-min').value.trim() || '00'
    const period = el.querySelector('#lj-period').textContent
    const repeat = el.querySelector('#lj-repeat').value
    const date = el.querySelector('#lj-date').value.trim()
    const reminder = el.querySelector('#lj-reminder').value
    const errorEl = el.querySelector('#lj-error')

    let days
    if (repeat === 'month' && date) {
        const [mo, dy, yr] = date.split('/')
        const d = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(dy))
        days = isNaN(d.getDay()) ? [] : [['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]]
    } else {
        days = [...el.querySelectorAll('.lj-day-pill.active')].map(p => p.dataset.day)
    }

    if (!name || !link || !hourVal || (repeat !== 'month' && !days.length)) return

    const btn = el.querySelector('#lj-submit')
    btn.textContent = 'Adding…'
    btn.disabled = true

    const response = await new Promise(resolve => {
        chrome.runtime.sendMessage(
            { type: 'createLink', data: { name, link, time: _to24h(hourVal, minVal, period), days, repeats: repeat, text: reminder, date, activated: true } },
            resolve
        )
    })

    if (response?.ok) {
        btn.textContent = 'Added!'
        btn.classList.add('lj-success')
        setTimeout(() => renderDashboard(), 1800)
    } else {
        errorEl.textContent = 'Failed to add. Make sure you\'re logged in.'
        errorEl.style.display = 'block'
        btn.textContent = 'Add to LinkJoin'
        btn.disabled = false
    }
}

// --- Settings ---

async function renderSettings() {
    const { ljAutoDetect = true } = await chrome.storage.local.get('ljAutoDetect')
    const app = document.getElementById('app')
    app.innerHTML = `
        <div class="header">
            <button class="back-btn" id="back-btn">&#8592;</button>
            <span class="logo-text">Settings</span>
        </div>
        <div class="settings-body">
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Auto-detect meetings</div>
                    <div class="setting-desc">Show overlay when a meeting link is found in Gmail</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="auto-detect-toggle" ${ljAutoDetect ? 'checked' : ''}>
                    <span class="toggle-track"></span>
                </label>
            </div>
        </div>
    `
    document.getElementById('back-btn').addEventListener('click', () => renderDashboard())
    document.getElementById('auto-detect-toggle').addEventListener('change', async e => {
        await chrome.storage.local.set({ ljAutoDetect: e.target.checked })
    })
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
            <button class="gear-btn" id="settings-btn" aria-label="Settings">
                <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor">
                    <path d="M471.46,212.99l-42.07-7.92c-3.63-12.37-8.58-24.3-14.79-35.64l24.16-35.37c4.34-6.35,3.54-14.9-1.9-20.34l-38.58-38.58c-5.44-5.44-13.99-6.24-20.34-1.9L342.57,97.4c-11.34-6.21-23.27-11.16-35.64-14.78l-7.92-42.07c-1.42-7.56-8.03-13.04-15.72-13.04h-54.57c-7.69,0-14.3,5.48-15.72,13.04l-7.92,42.07c-12.37,3.63-24.3,8.58-35.64,14.78l-35.37-24.16c-6.35-4.34-14.9-3.54-20.34,1.9l-38.58,38.58c-5.44,5.44-6.24,13.98-1.9,20.34l24.16,35.37c-6.21,11.34-11.16,23.27-14.79,35.64l-42.07,7.92c-7.56,1.42-13.04,8.03-13.04,15.72v54.57c0,7.69,5.48,14.3,13.04,15.72l42.07,7.92c3.63,12.37,8.58,24.3,14.79,35.64l-24.16,35.37c-4.34,6.35-3.54,14.9,1.9,20.34l38.58,38.58c5.44,5.44,13.99,6.24,20.34,1.9l35.37-24.16c11.34,6.21,23.27,11.16,35.64,14.79l7.92,42.07c1.42,7.56,8.03,13.04,15.72,13.04h54.57c7.69,0,14.3-5.48,15.72-13.04l7.92-42.07c12.37-3.63,24.3-8.58,35.64-14.79l35.37,24.16c6.35,4.34,14.9,3.54,20.34-1.9l38.58-38.58c5.44-5.44,6.24-13.98,1.9-20.34l-24.16-35.37c6.21-11.34,11.16-23.27,14.79-35.64l42.07-7.92c7.56-1.42,13.04-8.03,13.04-15.72v-54.57C484.5,221.02,479.02,214.42,471.46,212.99z M452.5,270.01l-38.98,7.34c-6.25,1.18-11.21,5.94-12.63,12.14c-3.69,16.02-10,31.25-18.77,45.25c-3.37,5.39-3.24,12.26,0.35,17.51l22.39,32.78l-19.82,19.82l-32.78-22.39c-5.25-3.59-12.12-3.73-17.51-0.35c-14.01,8.77-29.24,15.08-45.25,18.77c-6.2,1.43-10.96,6.38-12.14,12.63l-7.34,38.98h-28.03l-7.34-38.98c-1.18-6.25-5.94-11.21-12.14-12.63c-16.02-3.69-31.24-10-45.25-18.77c-5.39-3.37-12.26-3.24-17.51,0.35l-32.78,22.39l-19.82-19.82l22.39-32.78c3.59-5.25,3.72-12.12,0.35-17.51c-8.77-14.01-15.08-29.24-18.77-45.25c-1.43-6.2-6.38-10.96-12.63-12.14l-38.98-7.34v-28.03l38.98-7.34c6.25-1.18,11.21-5.94,12.63-12.14c3.69-16.02,10-31.25,18.77-45.25c3.37-5.39,3.24-12.26-0.35-17.51l-22.39-32.78l19.82-19.82l32.78,22.39c5.25,3.58,12.12,3.72,17.51,0.35c14.01-8.77,29.24-15.08,45.25-18.77c6.2-1.43,10.96-6.38,12.14-12.63l7.34-38.98h28.03l7.34,38.98c1.18,6.25,5.94,11.21,12.14,12.63c16.02,3.69,31.24,10,45.25,18.77c5.39,3.37,12.26,3.24,17.51-0.35l32.78-22.39l19.82,19.82l-22.39,32.78c-3.59,5.25-3.72,12.12-0.35,17.51c8.77,14.01,15.08,29.24,18.77,45.25c1.43,6.2,6.38,10.96,12.63,12.14l38.98,7.34V270.01z"/>
                    <path d="M256,148.26c-59.41,0-107.74,48.33-107.74,107.74c0,59.41,48.33,107.74,107.74,107.74S363.74,315.41,363.74,256C363.74,196.59,315.41,148.26,256,148.26z M256,331.74c-41.76,0-75.74-33.98-75.74-75.74c0-41.76,33.98-75.74,75.74-75.74s75.74,33.98,75.74,75.74C331.74,297.76,297.76,331.74,256,331.74z"/>
                </svg>
            </button>
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
        <div class="footer-actions">
            <button class="text-btn" id="reset-dismissed-btn">Reset dismissed</button>
        </div>
    `
    document.getElementById('dashboard-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: `${APP_URL}/links` })
    })
    document.getElementById('logout-btn').addEventListener('click', handleLogout)
    document.getElementById('settings-btn').addEventListener('click', renderSettings)
    document.getElementById('scan-btn').addEventListener('click', handleScan)
    document.getElementById('reset-dismissed-btn').addEventListener('click', async () => {
        const btn = document.getElementById('reset-dismissed-btn')
        chrome.runtime.sendMessage({ type: 'resetDismissed' })
        btn.textContent = 'Done!'
        setTimeout(() => { if (btn.isConnected) btn.textContent = 'Reset dismissed' }, 1500)
    })

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
