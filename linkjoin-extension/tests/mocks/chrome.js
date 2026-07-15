import { vi } from 'vitest'

// Hand-rolled chrome.* mock (not sinon-chrome/jest-chrome, which target
// Jest's mock API rather than Vitest's). Narrow surface: only what
// background.js actually touches. A fresh object per call keeps storage.local
// state from leaking between tests.
export function createChromeMock() {
  const localStore = {}

  return {
    __localStore: localStore,
    alarms: {
      create: vi.fn(),
      clearAll: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue([]),
      onAlarm: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn((keys) => {
          if (typeof keys === 'string') return Promise.resolve({ [keys]: localStore[keys] })
          if (Array.isArray(keys)) {
            const out = {}
            for (const k of keys) out[k] = localStore[k]
            return Promise.resolve(out)
          }
          return Promise.resolve({ ...localStore })
        }),
        set: vi.fn((obj) => {
          Object.assign(localStore, obj)
          return Promise.resolve()
        }),
      },
    },
    windows: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    identity: {
      getAuthToken: vi.fn(),
      removeCachedAuthToken: vi.fn().mockResolvedValue(undefined),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([]),
    },
    runtime: {
      getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
    },
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
      onButtonClicked: { addListener: vi.fn() },
      onClicked: { addListener: vi.fn() },
    },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn().mockResolvedValue(undefined),
      onClicked: { addListener: vi.fn() },
    },
    offscreen: {
      hasDocument: vi.fn().mockResolvedValue(false),
      createDocument: vi.fn().mockResolvedValue(undefined),
    },
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      openPopup: vi.fn().mockResolvedValue(undefined),
    },
  }
}
