import { useEffect, useRef } from 'react'
import { linksApi } from '../api/links.js'
import { shouldOpenThisWeek } from '../utils/repeatLogic.js'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STORAGE_KEY = 'lj_last_opened'

function getLastOpened() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function setLastOpened(id) {
  const map = getLastOpened()
  map[id] = Date.now()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

function weeksSince(ts) {
  return (Date.now() - ts) / (7 * 24 * 60 * 60 * 1000)
}

export function useAutoOpen(links, user, onDisable, onDelete) {
  const linksRef = useRef(links)
  const userRef = useRef(user)
  const onDisableRef = useRef(onDisable)
  const onDeleteRef = useRef(onDelete)
  const pausedRef = useRef(false)

  linksRef.current = links
  userRef.current = user
  onDisableRef.current = onDisable
  onDeleteRef.current = onDelete

  useEffect(() => {
    async function check() {
      if (pausedRef.current) return

      const u = userRef.current
      if (!u) return
      if (u.vacation_mode) return

      const orgDisabled = u.org_disabled === 'true'
      const openEarly = parseInt(u.open_early || 0) || 0

      const target = new Date(Date.now() + openEarly * 60000)
      const dayName = DAY_NAMES[target.getDay()]
      const m = target.getMinutes()
      const timeStr = `${target.getHours()}:${m < 10 ? '0' + m : m}`

      const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)

      for (const link of linksRef.current) {
        if (link.active === 'false') continue
        if (orgDisabled) continue
        if (link.end_date) {
          const [em, ed, ey] = link.end_date.split('/')
          if (em && ed && ey) {
            const endDate = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed))
            if (todayMidnight > endDate) continue
          }
        }
        if (link.time !== timeStr) continue
        if (!Array.isArray(link.days) || !link.days.includes(dayName)) continue
        if (!shouldOpenThisWeek(link, target, getLastOpened)) continue

        // Skip if extension already opened this meeting in the last 2 minutes
        const lastTs = getLastOpened()[link.id]
        if (lastTs && Date.now() - lastTs < 2 * 60 * 1000) continue

        const premeetParams = new URLSearchParams({ name: link.name || '', link: link.link })
        if (link.password) premeetParams.set('pw', link.password)
        window.open(`/premeet?${premeetParams}`, '_blank', 'noopener,noreferrer')
        linksApi.trackOpen().catch(() => {})
        setLastOpened(link.id)
        window.dispatchEvent(new CustomEvent('lj:opened'))

        if (link.repeat === 'never') {
          if (userRef.current?.auto_delete_past) {
            linksApi.delete(link.id).catch(() => {})
            onDeleteRef.current?.(link.id)
          } else {
            linksApi.toggle(link.id, 'false').catch(() => {})
            onDisableRef.current?.(link.id)
          }
        }

        // Pause 65 seconds to ensure the minute rolls over before the next check
        pausedRef.current = true
        setTimeout(() => { pausedRef.current = false }, 65000)
        break
      }
    }

    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [])
}
