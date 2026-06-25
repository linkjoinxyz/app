import { useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../api/client.js'

export function useWebSocket(email, token, onMessage) {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const mountedRef = useRef(false)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(async () => {
    if (!email || !token) return
    if (!mountedRef.current) return
    try {
      const { ticket } = await apiFetch('/ws-ticket')
      if (!mountedRef.current) return  // component unmounted during async fetch
      const apiUrl = import.meta.env.VITE_API_URL
      const url = apiUrl
        ? `${apiUrl.replace(/^http/, 'ws')}/ws/database?ticket=${encodeURIComponent(ticket)}`
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/database?ticket=${encodeURIComponent(ticket)}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          onMessageRef.current(data)
        } catch {}
      }

      ws.onclose = () => {
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, 5000)
      }
    }
  }, [email, token])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])
}
