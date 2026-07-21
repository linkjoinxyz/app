import { computeAlarmSchedule, buildPremeetParams } from './lib/scheduling.js'

const BASE_URL = 'https://linkjoin.azurewebsites.net'
const BASE_WS_URL = 'wss://linkjoin.azurewebsites.net'
const APP_URL = 'https://linkjoin.xyz'

let webSocket = null
let reconnectTimer = null

// --- Auth ---

async function getAuth() {
    const { token, email } = await chrome.storage.local.get(['token', 'email'])
    return token ? { token, email: email || '' } : null
}

// Access tokens are short-lived. The background worker runs between page visits,
// so without this its stored token simply goes stale and every alarm, websocket
// ticket and link fetch silently stops working until the user opens the web app
// again. Single in-flight promise: several alarms can fire at once and each
// refresh rotates (and thus invalidates) the previous refresh token.
let refreshInFlight = null

async function refreshSession() {
    const { refresh_token: refreshToken } = await chrome.storage.local.get(['refresh_token'])
    if (!refreshToken) return null
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            try {
                const res = await fetch(`${BASE_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                })
                if (!res.ok) return null
                const data = await res.json()
                if (!data?.access_token) return null
                await chrome.storage.local.set({
                    token: data.access_token,
                    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
                })
                return data.access_token
            } catch (e) {
                console.warn('[LJ] refresh failed', e?.message)
                return null
            } finally {
                refreshInFlight = null
            }
        })()
    }
    return refreshInFlight
}

async function apiFetch(path, options = {}, _retried = false) {
    const auth = await getAuth()
    if (!auth) { console.warn('[LJ] apiFetch: no auth for', path); return null }
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.token}`,
                ...(options.headers || {}),
            },
        })
        if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
            const fresh = await refreshSession()
            if (fresh) return apiFetch(path, options, true)
        }
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            console.error('[LJ] apiFetch', path, 'status:', res.status, body.slice(0, 200))
            return { __error: true, status: res.status }
        }
        return await res.json()
    } catch (e) {
        console.error('[LJ] apiFetch', path, 'fetch error:', e.message)
        return null
    }
}

// --- WebSocket ---

async function createWebsocket() {
    const auth = await getAuth()
    if (!auth) return

    const data = await apiFetch('/ws-ticket')
    if (!data?.ticket) {
        scheduleReconnect()
        return
    }

    if (webSocket) {
        webSocket.onclose = null
        webSocket.close()
    }

    webSocket = new WebSocket(`${BASE_WS_URL}/ws/database?ticket=${encodeURIComponent(data.ticket)}`)

    webSocket.onmessage = async (e) => {
        const msg = JSON.parse(e.data)
        await recreateAlarms(msg.links || [])
    }

    webSocket.onclose = () => {
        scheduleReconnect()
    }
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(createWebsocket, 10000)
}

// --- Alarms ---

export async function recreateAlarms(links) {
    await chrome.alarms.clearAll()
    chrome.alarms.create('resetWebsocket', { delayInMinutes: 60, periodInMinutes: 60 })

    const alarmData = {}
    for (const entry of computeAlarmSchedule(links, new Date())) {
        chrome.alarms.create(entry.name, { when: entry.whenMs })
        alarmData[entry.name] = entry.data
    }

    await chrome.storage.local.set({ alarmData })
    await updateBadge()
}

function isLocalToday(ms) {
    return localDateKey(new Date(ms)) === localDateKey()
}

async function updateBadge() {
    const alarms = await chrome.alarms.getAll()
    const { alarmData = {} } = await chrome.storage.local.get('alarmData')
    const count = alarms.filter(a => {
        const d = alarmData[a.name]
        return d && !d.notify && isLocalToday(a.scheduledTime)
    }).length
    await chrome.action.setBadgeText({ text: count ? String(count) : '' })
    await chrome.action.setBadgeBackgroundColor({ color: '#2B8FD8' })
}

// --- Chrome event listeners ---

function localDateKey(d = new Date()) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Shared by: the open-alarm firing naturally, a "Join now" notification button
// click, and a notification-body click. Deliberately includes the one-time
// (repeat === 'never') deactivation so joining via any of the three paths
// behaves identically.
export async function openMeetingWindow(entry) {
    const { lj_last_opened = {} } = await chrome.storage.local.get('lj_last_opened')
    // Skip if web app (or a previous button click) already opened this meeting
    // in the last 2 minutes
    if (lj_last_opened[entry.id] && Date.now() - lj_last_opened[entry.id] < 2 * 60 * 1000) return

    const premeetParams = buildPremeetParams(entry)
    if (!premeetParams) return
    await chrome.windows.create({ url: chrome.runtime.getURL('premeet.html') + '?' + premeetParams, type: 'popup', width: 440, height: 360, focused: true })

    await chrome.storage.local.set({ lj_last_opened: { ...lj_last_opened, [entry.id]: Date.now() } })

    if (entry.repeat === 'never') {
        await apiFetch(`/links/${entry.id}/toggle`, {
            method: 'PATCH',
            body: JSON.stringify({ id: entry.id, active: 'false' }),
        })
    }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'resetWebsocket') {
        if (webSocket) webSocket.close()
        await createWebsocket()
        return
    }

    if (!alarm.name.startsWith('lj-')) return

    const { alarmData = {} } = await chrome.storage.local.get('alarmData')
    const entry = alarmData[alarm.name]
    if (!entry) return

    if (entry.notify) {
        chrome.notifications.create(alarm.name, {
            type: 'basic',
            iconUrl: '/icons/logo-rounded.png',
            title: 'Meeting starting in 2 minutes',
            message: entry.name || 'Your meeting is about to start',
            buttons: [{ title: 'Join now' }, { title: 'Skip today' }],
        })
        return
    }

    // "Skip today" only suppresses the natural alarm firing. A deliberate
    // "Join now" click (openMeetingWindow called directly) always works
    // regardless of an earlier skip for this meeting.
    const { lj_skipped = {} } = await chrome.storage.local.get('lj_skipped')
    if (lj_skipped[entry.id] === localDateKey()) {
        await updateBadge()
        return
    }

    await openMeetingWindow(entry)
    await updateBadge()
})

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    const { alarmData = {} } = await chrome.storage.local.get('alarmData')
    const entry = alarmData[notificationId]
    if (!entry) return

    if (buttonIndex === 0) {
        await openMeetingWindow(entry)
    } else if (buttonIndex === 1) {
        const { lj_skipped = {} } = await chrome.storage.local.get('lj_skipped')
        await chrome.storage.local.set({ lj_skipped: { ...lj_skipped, [entry.id]: localDateKey() } })
    }
    chrome.notifications.clear(notificationId)
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
    const { alarmData = {} } = await chrome.storage.local.get('alarmData')
    const entry = alarmData[notificationId]
    if (!entry) return
    await openMeetingWindow(entry)
    chrome.notifications.clear(notificationId)
})

// Silent Google sign-in for managed/Workspace Chromebooks: uses Chrome's
// built-in identity API against the browser's already-signed-in profile, so
// it works even with zero open tabs and zero prior browsing (the common
// freshly-provisioned-Chromebook case). Never called with interactive:true.
// an unprompted consent popup during a background-triggered install flow is
// worse than the existing branded login-tab fallback for ordinary users.
export async function zeroTouchGoogleLogin() {
    if (!chrome.identity) return false
    try {
        const result = await chrome.identity.getAuthToken({ interactive: false })
        const accessToken = typeof result === 'string' ? result : result?.token
        if (!accessToken) return false

        const res = await fetch(`${BASE_URL}/auth/google-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken }),
        })
        const data = await res.json().catch(() => null)

        if (data?.mfa_required) {
            // No UI surface in the background context to collect an MFA code.
            // Discard the cached token so a later manual login isn't blocked by
            // a stuck silent token, and let the caller fall through.
            await chrome.identity.removeCachedAuthToken({ token: accessToken }).catch(() => {})
            return false
        }
        if (data?.access_token) {
            await chrome.storage.local.set({ token: data.access_token, email: data.email })
            createWebsocket()
            return true
        }
        return false
    } catch (e) {
        console.warn('[LJ] zero-touch google login failed', e?.message)
        return false
    }
}

// On fresh install: try zero-touch Google sign-in first, then check if the
// user is already logged into linkjoin.xyz in an open tab (pulling that
// session in directly rather than waiting for lj-auth-sync.js to fire on a
// future page load). Otherwise, open the login page so they're never left
// with a silently-signed-out popup and no indication why.
export async function autoLoginOrPrompt() {
    const { token } = await chrome.storage.local.get('token')
    if (token) return

    if (await zeroTouchGoogleLogin()) return

    try {
        const tabs = await chrome.tabs.query({ url: `${APP_URL}/*` })
        for (const tab of tabs) {
            if (!tab.id) continue
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => ({ token: localStorage.getItem('lj_token'), email: localStorage.getItem('lj_email') }),
                })
                const result = results?.[0]?.result
                if (result?.token && result?.email) {
                    await chrome.storage.local.set({ token: result.token, email: result.email })
                    createWebsocket()
                    return
                }
            } catch (e) {
                console.warn('[LJ] auto-login: could not read session from tab', tab.id, e.message)
            }
        }
    } catch (e) {
        console.warn('[LJ] auto-login: tab query failed', e.message)
    }

    chrome.tabs.create({ url: `${APP_URL}/login` })
}

chrome.runtime.onInstalled.addListener(async (details) => {
    await createOffscreen()
    await setupContextMenu()
    await createWebsocket()
    if (details.reason === 'install') {
        await autoLoginOrPrompt()
    }
})

chrome.runtime.onStartup.addListener(async () => {
    await createOffscreen()
    await setupContextMenu()
    await createWebsocket()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.keepAlive) return
    if (msg.type === 'login') {
        if (webSocket) webSocket.close()
        createWebsocket()
    }
    if (msg.type === 'logout') {
        if (webSocket) {
            webSocket.onclose = null
            webSocket.close()
            webSocket = null
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
        }
        chrome.alarms.clearAll()
    }
    if (msg.type === 'getLinks') {
        apiFetch('/links').then(result => sendResponse(result || null))
        return true
    }
    if (msg.type === 'extractMeeting') {
        apiFetch('/ai/extract-meeting', {
            method: 'POST',
            body: JSON.stringify({ subject: msg.subject, body: msg.body, user_timezone: msg.timezone }),
        }).then(result => {
            if (result?.__error && result.status === 403) {
                sendResponse({ __premiumRequired: true })
            } else {
                sendResponse((result && !result.__error) ? result : null)
            }
        })
        return true
    }
    if (msg.type === 'createLink') {
        apiFetch('/links', {
            method: 'POST',
            body: JSON.stringify(msg.data),
        }).then(result => sendResponse({ ok: !!result && !result.__error, result }))
        return true
    }
    if (msg.type === 'resetDismissed') {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) chrome.tabs.sendMessage(tab.id, { type: 'resetDismissed' }).catch(() => {})
        })
    }
})

function deriveClickTarget(e) {
    const url = e.linkUrl || e.pageUrl
    const name = e.selectionText || url.replace(/^https?:\/\//, '').split('/')[0]
    return { url, name }
}

async function handleBookmarkClick(e) {
    const { url, name } = deriveClickTarget(e)
    await apiFetch('/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ name, link: url }),
    })
}

async function handleAddToLinkJoinClick(e) {
    const { url, name } = deriveClickTarget(e)
    try {
        if (typeof chrome.action.openPopup !== 'function') throw new Error('openPopup unavailable')
        chrome.storage.local.set({ pendingAddLink: { link: url, name } })
        await chrome.action.openPopup()
    } catch (err) {
        console.warn('[LJ] openPopup failed, falling back to bookmark', err?.message)
        await apiFetch('/bookmarks', {
            method: 'POST',
            body: JSON.stringify({ name, link: url }),
        })
    }
}

chrome.contextMenus.onClicked.addListener(async (e) => {
    if (e.menuItemId === 'bookmark-to-linkjoin') return handleBookmarkClick(e)
    if (e.menuItemId === 'add-to-linkjoin') return handleAddToLinkJoinClick(e)
})

// --- Utilities ---

async function setupContextMenu() {
    await chrome.contextMenus.removeAll()
    chrome.contextMenus.create({
        title: 'Add to LinkJoin',
        id: 'add-to-linkjoin',
        visible: true,
        contexts: ['all'],
    })
    chrome.contextMenus.create({
        title: 'Bookmark this link',
        id: 'bookmark-to-linkjoin',
        visible: true,
        contexts: ['all'],
    })
}

async function createOffscreen() {
    if (await chrome.offscreen.hasDocument?.()) return
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'keep service worker running',
    })
}
