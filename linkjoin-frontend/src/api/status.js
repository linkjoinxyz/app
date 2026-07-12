const BASE = import.meta.env.VITE_API_URL || '/api'

export async function getStatusSummary() {
  const res = await fetch(`${BASE}/status/summary`)
  if (!res.ok) throw new Error('Failed to fetch status')
  return res.json()
}
