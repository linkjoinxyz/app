// Pure scheduling logic, no chrome.* calls, so it can run under Vitest
// exactly as-is. Behavior-preserving extraction from background.js.

const PRE_MEET_MS = 5000
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function changeTime(days, time, before) {
    const daysList = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    let hour = parseInt(time.split(':')[0])
    let minute = parseInt(time.split(':')[1])
    if (before) {
        minute -= before
        if (minute < 0) { hour--; minute += 60 }
        if (hour < 0) {
            hour += 24
            days = days.map(d => daysList[(daysList.indexOf(d) + 6) % 7])
        }
    }
    return { hour, minute, days }
}

export function dateDiffInDays(a, b) {
    const MS_PER_DAY = 1000 * 60 * 60 * 24
    const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
    const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
    return Math.floor((utc2 - utc1) / MS_PER_DAY)
}

export function firstBizDay(year, month) {
    const dow = new Date(year, month, 1).getDay()
    return dow === 0 ? 2 : dow === 6 ? 3 : 1
}

export function effectiveDomDate(year, month, n) {
    const d = new Date(year, month, n)
    if (d.getMonth() !== month) return null
    const dow = d.getDay()
    if (dow === 6) d.setDate(d.getDate() + 2)
    if (dow === 0) d.setDate(d.getDate() + 1)
    return d
}

export function nthWeekdayInMonth(year, month, dayOfWeek, n, hour, minute) {
    const firstDay = new Date(year, month, 1)
    const diff = (dayOfWeek - firstDay.getDay() + 7) % 7
    const d = new Date(year, month, 1 + diff + (n - 1) * 7)
    d.setHours(hour, minute, 0, 0)
    return d.getMonth() === month ? d : null
}

// Decides which alarms should exist for a set of links, as of `now`.
// Returns {name, whenMs, data} entries instead of calling chrome.alarms.create
// so the scheduling decision is testable without a chrome mock.
export function computeAlarmSchedule(links, now = new Date()) {
    const nowMs = now.getTime()
    const entries = []

    function isPastEndDate(link) {
        if (!link.end_date) return false
        try {
            const [m, d, y] = link.end_date.split('/').map(Number)
            return now > new Date(y, m - 1, d, 23, 59, 59)
        } catch { return false }
    }

    function linkData(link) {
        return { id: link.id, link: link.link, slug: link.slug || null, repeat: link.repeat, name: link.name, password: link.password || null }
    }

    function addPair(link, suffix, target) {
        entries.push({ name: `lj-${link.id}-${suffix}`, whenMs: target.getTime() - PRE_MEET_MS, data: linkData(link) })
        const notifyWhen = target.getTime() - 2 * 60 * 1000
        if (notifyWhen > nowMs) {
            entries.push({ name: `lj-notify-${link.id}-${suffix}`, whenMs: notifyWhen, data: { notify: true, ...linkData(link) } })
        }
    }

    for (const link of links) {
        if (link.active === 'false' || (!link.link && !link.slug)) continue
        if (isPastEndDate(link)) continue

        if (link.repeat === 'same_weekday') {
            const info = changeTime([], link.time, 0)
            for (let i = 0; i <= 62; i++) {
                const check = new Date(now)
                check.setDate(now.getDate() + i)
                check.setHours(info.hour, info.minute, 0, 0)
                if (check.getDate() === firstBizDay(check.getFullYear(), check.getMonth()) && check.getTime() > nowMs) {
                    addPair(link, 'fbm', check)
                    break
                }
            }
            continue
        }

        if (/^day \d+$/.test(link.repeat)) {
            const dayNum = parseInt(link.repeat.split(' ')[1])
            const info = changeTime([], link.time, 0)

            let target = null
            for (let offset = 0; offset <= 2; offset++) {
                const totalMonth = now.getMonth() + offset
                const yr = totalMonth > 11 ? now.getFullYear() + 1 : now.getFullYear()
                const mo = totalMonth % 12
                const candidate = effectiveDomDate(yr, mo, dayNum)
                if (!candidate) continue
                candidate.setHours(info.hour, info.minute, 0, 0)
                if (candidate.getTime() > nowMs) { target = candidate; break }
            }

            if (target) addPair(link, 'dom', target)
            continue
        }

        if (link.repeat === 'month') {
            const info = changeTime([...link.days], link.time, 0)
            const parts = (link.date || '').split('/')
            const refDay = parts.length === 3 ? parseInt(parts[1], 10) : NaN
            const weekNum = (!isNaN(refDay) && refDay >= 1) ? Math.ceil(refDay / 7) : 1

            for (const day of info.days) {
                const dayIndex = DAYS.indexOf(day)
                let target = nthWeekdayInMonth(now.getFullYear(), now.getMonth(), dayIndex, weekNum, info.hour, info.minute)
                if (!target || target.getTime() <= nowMs) {
                    const nm = now.getMonth() === 11 ? 0 : now.getMonth() + 1
                    const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
                    target = nthWeekdayInMonth(ny, nm, dayIndex, weekNum, info.hour, info.minute)
                }
                if (target && target.getTime() > nowMs) addPair(link, day, target)
            }
            continue
        }

        if (!link.days?.length) continue

        const info = changeTime([...link.days], link.time, 0)

        for (const day of info.days) {
            const linkDay = new Date(now)
            const daysUntil = (7 - (now.getDay() - DAYS.indexOf(day))) % 7
            linkDay.setDate(linkDay.getDate() + daysUntil)

            const alreadyPassed =
                (info.hour < now.getHours() ||
                    (info.hour === now.getHours() && info.minute <= now.getMinutes())) &&
                daysUntil === 0
            if (alreadyPassed) linkDay.setDate(linkDay.getDate() + 7)

            linkDay.setHours(info.hour, info.minute, 0, 0)

            let delayMs = 0
            if (/^\d/.test(link.repeat)) {
                delayMs = 10080 * parseInt(link.repeat) * 60000
            }
            if (link.date) {
                const [_m, _d, _y] = link.date.split('/').map(Number)
                const diff = dateDiffInDays(now, new Date(_y, _m - 1, _d))
                if (diff < 0 || (diff === 0 && nowMs > linkDay.getTime())) continue
                delayMs += 1440 * diff * 60000
            }

            const when = linkDay.getTime() + delayMs
            if (when > nowMs) {
                addPair(link, day, new Date(when))
            }
        }
    }

    return entries
}

// Decides the premeet.html popup URL params for a meeting entry. Returns
// null when the entry's link has a non-http(s) protocol (extension should
// then no-op rather than open a popup at all).
export function buildPremeetParams(entry) {
    if (entry.slug) {
        return new URLSearchParams({ name: entry.name || '', slug: entry.slug })
    }
    try {
        const proto = new URL(entry.link).protocol
        if (proto !== 'http:' && proto !== 'https:') return null
    } catch {
        return null
    }
    const params = new URLSearchParams({ name: entry.name || '', link: entry.link })
    if (entry.password) params.set('pw', entry.password)
    return params
}
