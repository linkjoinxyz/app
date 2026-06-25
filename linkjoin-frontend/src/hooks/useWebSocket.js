import { useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../api/client.js'

const BASE_DELAY = 3000
const MAX_DELAY = 60000

export function useWebSocket(email, token, onMessage) {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const mountedRef = useRef(false)
  const connectingRef = useRef(false)
  const attemptRef = useRef(0)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(async () => {
    if (!email || !token) return
    if (!mountedRef.current) return
    if (connectingRef.current) return
    connectingRef.current = true

    // Close any existing connection before opening a new one
    if (wsRef.current && wsRef.current.readyState < 2) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    wsRef.current = null

    try {
      const data = await apiFetch('/ws-ticket')
      if (!mountedRef.current) { connectingRef.current = false; return }
      const ticket = data?.ticket
      if (!ticket) throw new Error('no ticket')

      const apiUrl = import.meta.env.VITE_API_URL
      const url = apiUrl
        ? `${apiUrl.replace(/^http/, 'ws')}/ws/database?ticket=${encodeURIComponent(ticket)}`
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/database?ticket=${encodeURIComponent(ticket)}`
      const ws = new WebSocket(url)
      wsRef.current = ws
      connectingRef.current = false

      ws.onopen = () => { attemptRef.current = 0 }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          onMessageRef.current(msg)
        } catch {}
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        const delay = Math.min(BASE_DELAY * 2 ** attemptRef.current, MAX_DELAY)
        attemptRef.current += 1
        reconnectTimer.current = setTimeout(connect, delay)
      }

      ws.onerror = () => { ws.close() }
    } catch (err) {
      connectingRef.current = false
      if (!mountedRef.current) return
      // Back off longer on rate-limit
      const is429 = err?.status === 429
      const delay = is429
        ? MAX_DELAY
        : Math.min(BASE_DELAY * 2 ** attemptRef.current, MAX_DELAY)
      attemptRef.current += 1
      reconnectTimer.current = setTimeout(connect, delay)
    }
  }, [email, token])

  useEffect(() => {
    mountedRef.current = true
    attemptRef.current = 0
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])
}
