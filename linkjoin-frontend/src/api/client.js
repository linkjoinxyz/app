// In dev, Vite proxies /api → localhost:8000 (see vite.config.js).
// In production on Vercel, set VITE_API_URL to the Azure backend origin.
const BASE = import.meta.env.VITE_API_URL || '/api'

function getToken() {
  return localStorage.getItem('lj_token')
}

// Access tokens are short-lived now, so a 401 is usually "expired", not "signed
// out". Exchange the refresh token for a new pair and replay the request once.
// Shared promise: a page load fires several requests at once and they would
// otherwise each burn a refresh token, and each rotation invalidates the last.
let refreshInFlight = null

async function refreshSession() {
  const refreshToken = localStorage.getItem('lj_refresh_token')
  if (!refreshToken) return null
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => {
        if (data?.access_token) {
          localStorage.setItem('lj_token', data.access_token)
          if (data.refresh_token) localStorage.setItem('lj_refresh_token', data.refresh_token)
          // Keep the extension's copy in step; it reads these from the page.
          window.postMessage({ type: 'lj:login' }, window.location.origin)
        }
        refreshInFlight = null
        return data?.access_token || null
      })
  }
  return refreshInFlight
}

function signOutAndRedirect() {
  localStorage.removeItem('lj_token')
  localStorage.removeItem('lj_refresh_token')
  localStorage.removeItem('lj_email')
  const redirect = window.location.pathname + window.location.search
  window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`
}

export async function apiFetch(path, options = {}, _retried = false) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (!_retried) {
        const fresh = await refreshSession()
        if (fresh) return apiFetch(path, options, true)
      }
      signOutAndRedirect()
      return
    }
    const detail = body.detail
    const message = Array.isArray(detail)
      ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
      : (typeof detail === 'string' ? detail : 'Request failed')
    throw Object.assign(new Error(message), { status: res.status, body })
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return null
  return res.json()
}

export function apiGet(path) {
  return apiFetch(path)
}

export function apiPost(path, data) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(data) })
}

export function apiPut(path, data) {
  return apiFetch(path, { method: 'PUT', body: JSON.stringify(data) })
}

export function apiPatch(path, data) {
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(data) })
}

export function apiDelete(path, data) {
  return apiFetch(path, { method: 'DELETE', ...(data ? { body: JSON.stringify(data) } : {}) })
}

export async function apiDownload(path, filename) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
