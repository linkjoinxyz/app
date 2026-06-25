const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function effectiveDomDate(year, month, dayNum) {
  const d = new Date(year, month, dayNum)
  if (d.getMonth() !== month) return null
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() + 2)
  if (dow === 0) d.setDate(d.getDate() + 1)
  return d
}

export function firstBizDay(year, month) {
  const dow = new Date(year, month, 1).getDay()
  if (dow === 0) return 2
  if (dow === 6) return 3
  return 1
}

// Returns true if today is in the correct week-of-month for a 'month' repeat link.
// Combined with the link.days check in the caller, this gates opening to the right weekday.
// getLastOpened: () => { [id]: timestamp } — injectable for testing n-week repeats.
export function shouldOpenThisWeek(link, now = new Date(), getLastOpened = () => ({})) {
  const repeat = link.repeat
  if (repeat === 'week' || repeat === 'never' || !repeat) return true

  if (repeat === 'same_weekday') {
    return now.getDate() === firstBizDay(now.getFullYear(), now.getMonth())
  }

  if (/^day \d+$/.test(repeat)) {
    const dayNum = parseInt(repeat.split(' ')[1])
    const eff = effectiveDomDate(now.getFullYear(), now.getMonth(), dayNum)
    if (!eff) return false
    return now.getDate() === eff.getDate() && now.getMonth() === eff.getMonth()
  }

  if (repeat === 'month') {
    const todayWeek = Math.ceil(now.getDate() / 7)
    if (!link.date) return todayWeek === 1
    const parts = link.date.split('/')
    const refDay = parts.length === 3 ? parseInt(parts[1], 10) : NaN
    if (isNaN(refDay)) return todayWeek === 1
    return todayWeek === Math.ceil(refDay / 7)
  }

  // n-week repeats: '2 times', '3 times', '4 times'
  const n = parseInt(repeat)
  if (!n || n <= 1) return true
  const last = getLastOpened()[link.id]
  if (!last) return true
  const weeksSince = (Date.now() - last) / (7 * 24 * 60 * 60 * 1000)
  return weeksSince >= n - 0.5

}

// Full open check mirroring useAutoOpen — returns true if link should open right now.
export function shouldOpenNow(link, now = new Date()) {
  if (link.active === 'false') return false

  const dayName = DAY_NAMES[now.getDay()]
  if (!Array.isArray(link.days) || !link.days.includes(dayName)) return false

  const h = now.getHours()
  const m = now.getMinutes()
  const timeStr = `${h}:${m < 10 ? '0' + m : m}`
  if (link.time !== timeStr) return false

  return shouldOpenThisWeek(link, now)
}

// Returns minutes until the next occurrence of link (used for sorting / blue pill).
export function minutesUntilNext(link, now = new Date()) {
  const todayIdx = now.getDay()
  const currentMins = now.getHours() * 60 + now.getMinutes()
  const [h, m] = (link.time || '0:0').split(':').map(Number)
  const linkMins = h * 60 + m
  const days = Array.isArray(link.days) ? link.days : []

  if (link.repeat === 'never') {
    if (!link.date) return Infinity
    const d = new Date(link.date + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    return Math.max(0, (d - now) / 60000)
  }

  if (!link.repeat || link.repeat === 'week') {
    for (let i = 0; i < 8; i++) {
      if (!days.includes(DAY_NAMES[(todayIdx + i) % 7])) continue
      const minsAway = i * 1440 + linkMins - currentMins
      if (minsAway > 0) return minsAway
    }
    return Infinity
  }

  if (link.repeat === 'month') {
    const parts = (link.date || '').split('/')
    const refDay = parts.length === 3 ? parseInt(parts[1], 10) : NaN
    const weekNum = (!isNaN(refDay) && refDay >= 1) ? Math.ceil(refDay / 7) : 1
    for (let i = 0; i <= 62; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      if (days.includes(DAY_NAMES[d.getDay()]) && Math.ceil(d.getDate() / 7) === weekNum) {
        const minsAway = i * 1440 + linkMins - currentMins
        if (minsAway > 0) return minsAway
      }
    }
    return Infinity
  }

  return Infinity
}
