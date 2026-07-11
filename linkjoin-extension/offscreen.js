const BASE_URL = 'https://linkjoin.azurewebsites.net'

setInterval(() => {
  chrome.runtime.sendMessage({ keepAlive: true });
}, 20000);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'extractMeetingOffscreen') return false
    console.log('[LJ offscreen] extractMeetingOffscreen received')
    ;(async () => {
        try {
            const { token } = await chrome.storage.local.get('token')
            console.log('[LJ offscreen] token:', token ? 'present' : 'missing')
            if (!token) { sendResponse(null); return }
            console.log('[LJ offscreen] fetching', BASE_URL + '/ai/extract-meeting')
            const res = await fetch(`${BASE_URL}/ai/extract-meeting`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ subject: msg.subject, body: msg.body, user_timezone: msg.user_timezone }),
            })
            console.log('[LJ offscreen] response status:', res.status)
            sendResponse(res.ok ? await res.json() : null)
        } catch (e) {
            console.error('[LJ offscreen] error:', e)
            sendResponse(null)
        }
    })()
    return true
})