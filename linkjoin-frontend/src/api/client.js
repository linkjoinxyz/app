// In dev, Vite proxies /api → localhost:8000 (see vite.config.js).
// In production on Vercel, set VITE_API_URL to the Azure backend origin.
const BASE = import.meta.env.VITE_API_URL || '/api'

function getToken() {
  return localStorage.getItem('lj_token')
}

export async function apiFetch(path, options = {}) {
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
      localStorage.removeItem('lj_token')
      localStorage.removeItem('lj_email')
      window.location.href = '/login'
      return
    }
    const detail = body.detail
    const message = Array.isArray(detail)
      ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
      : (typeof detail === 'string' ? detail : 'Request failed')
    throw Object.assign(new Error(message), { status: res.status, body })
  }
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

export function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' })
}
