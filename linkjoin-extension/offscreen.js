const BASE_URL = 'https://linkjoin.azurewebsites.net'

setInterval(() => {
  chrome.runtime.sendMessage({ keepAlive: true });
}, 20000);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'extractMeetingOffscreen') return false
    ;(async () => {
        try {
            const { token } = await chrome.storage.local.get('token')
            if (!token) { sendResponse(null); return }
            const res = await fetch(`${BASE_URL}/ai/extract-meeting`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ subject: msg.subject, body: msg.body, user_timezone: msg.user_timezone }),
            })
            sendResponse(res.ok ? await res.json() : null)
        } catch (e) {
            console.error('[LJ offscreen] error:', e)
            sendResponse(null)
        }
    })()
    return true
})