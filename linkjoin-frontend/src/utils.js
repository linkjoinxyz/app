export function openSafeUrl(url) {
  try {
    const { protocol } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {}
}

export function safeRedirect(raw) {
  if (!raw) return '/meetings'
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/meetings'
}
