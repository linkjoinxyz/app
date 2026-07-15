import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createChromeMock } from './mocks/chrome.js'

// background.js registers its chrome.*.addListener calls at import time (a
// one-time side effect of the ES module cache), so the chrome global must be
// stubbed before the import resolves, not inside beforeEach.
vi.stubGlobal('chrome', createChromeMock())
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
const { openMeetingWindow, recreateAlarms, zeroTouchGoogleLogin, autoLoginOrPrompt } = await import('../background.js')

let chromeMock

beforeEach(() => {
  chromeMock = createChromeMock()
  vi.stubGlobal('chrome', chromeMock)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})

describe('openMeetingWindow', () => {
  it('opens a popup window for a link-based meeting and records lj_last_opened', async () => {
    const entry = { id: 'a', name: 'Standup', link: 'https://zoom.us/j/1', repeat: '0' }
    await openMeetingWindow(entry)

    expect(chromeMock.windows.create).toHaveBeenCalledTimes(1)
    const url = chromeMock.windows.create.mock.calls[0][0].url
    expect(url).toContain('premeet.html')
    expect(url).toContain('link=' + encodeURIComponent('https://zoom.us/j/1').replace(/%20/g, '+'))
    expect(chromeMock.__localStore.lj_last_opened.a).toBeTypeOf('number')
  })

  it('does not reopen a meeting already opened in the last 2 minutes', async () => {
    const entry = { id: 'a', name: 'Standup', link: 'https://zoom.us/j/1', repeat: '0' }
    chromeMock.__localStore.lj_last_opened = { a: Date.now() - 30000 }
    await openMeetingWindow(entry)
    expect(chromeMock.windows.create).not.toHaveBeenCalled()
  })

  it('does nothing for a non-http(s) link', async () => {
    const entry = { id: 'a', name: 'Bad', link: 'javascript:alert(1)', repeat: '0' }
    await openMeetingWindow(entry)
    expect(chromeMock.windows.create).not.toHaveBeenCalled()
  })

  it('deactivates a one-time (repeat: never) meeting after opening it', async () => {
    chromeMock.__localStore.token = 'tok123'
    const entry = { id: 'a', name: 'One-off', link: 'https://zoom.us/j/1', repeat: 'never' }
    await openMeetingWindow(entry)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/links/a/toggle'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})

describe('recreateAlarms', () => {
  it('clears existing alarms, re-adds the websocket-reset alarm, and schedules links', async () => {
    const links = [{ id: 'a', link: 'https://zoom.us/j/1', name: 'Standup', repeat: '0', days: ['Mon'], time: '09:00' }]
    await recreateAlarms(links)

    expect(chromeMock.alarms.clearAll).toHaveBeenCalled()
    expect(chromeMock.alarms.create).toHaveBeenCalledWith('resetWebsocket', { delayInMinutes: 60, periodInMinutes: 60 })
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ alarmData: expect.any(Object) }))
  })
})

describe('zeroTouchGoogleLogin', () => {
  it('returns false when no cached auth token is available', async () => {
    chromeMock.identity.getAuthToken.mockResolvedValue(undefined)
    expect(await zeroTouchGoogleLogin()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stores the session and returns true on a successful silent login', async () => {
    chromeMock.identity.getAuthToken.mockResolvedValue({ token: 'gtok' })
    fetch.mockResolvedValue({ ok: true, json: async () => ({ access_token: 'ljtok', email: 'a@b.com' }) })

    expect(await zeroTouchGoogleLogin()).toBe(true)
    expect(chromeMock.__localStore.token).toBe('ljtok')
    expect(chromeMock.__localStore.email).toBe('a@b.com')
  })

  it('discards the cached token and returns false when MFA is required', async () => {
    chromeMock.identity.getAuthToken.mockResolvedValue({ token: 'gtok' })
    fetch.mockResolvedValue({ ok: true, json: async () => ({ mfa_required: true }) })

    expect(await zeroTouchGoogleLogin()).toBe(false)
    expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: 'gtok' })
  })
})

describe('autoLoginOrPrompt', () => {
  it('does nothing if already logged in', async () => {
    chromeMock.__localStore.token = 'existing'
    await autoLoginOrPrompt()
    expect(chromeMock.identity.getAuthToken).not.toHaveBeenCalled()
  })

  it('falls back to reading an open linkjoin.xyz tab session when zero-touch login fails', async () => {
    chromeMock.identity.getAuthToken.mockResolvedValue(undefined)
    chromeMock.tabs.query.mockResolvedValue([{ id: 42 }])
    chromeMock.scripting.executeScript.mockResolvedValue([{ result: { token: 'tabtok', email: 'tab@b.com' } }])

    await autoLoginOrPrompt()

    expect(chromeMock.__localStore.token).toBe('tabtok')
    expect(chromeMock.tabs.create).not.toHaveBeenCalled()
  })

  it('opens the login page when zero-touch login and tab sniffing both fail', async () => {
    chromeMock.identity.getAuthToken.mockResolvedValue(undefined)
    chromeMock.tabs.query.mockResolvedValue([])

    await autoLoginOrPrompt()

    expect(chromeMock.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/login') }))
  })
})
