import { describe, it, expect } from 'vitest'
import {
  changeTime,
  dateDiffInDays,
  firstBizDay,
  effectiveDomDate,
  nthWeekdayInMonth,
  computeAlarmSchedule,
  buildPremeetParams,
} from '../../lib/scheduling.js'

describe('changeTime', () => {
  it('parses hour/minute with no shift', () => {
    expect(changeTime(['Mon'], '09:05', 0)).toEqual({ hour: 9, minute: 5, days: ['Mon'] })
  })

  it('shifts minutes back across midnight and rolls the day back', () => {
    expect(changeTime(['Mon'], '00:10', 15)).toEqual({ hour: 23, minute: 55, days: ['Sun'] })
  })
})

describe('dateDiffInDays', () => {
  it('counts whole days between two dates, sign included', () => {
    expect(dateDiffInDays(new Date(2026, 0, 1), new Date(2026, 0, 10))).toBe(9)
    expect(dateDiffInDays(new Date(2026, 0, 10), new Date(2026, 0, 1))).toBe(-9)
  })
})

describe('firstBizDay', () => {
  it('returns 1 when the month starts on a weekday', () => {
    // Jan 1 2026 is a Thursday
    expect(firstBizDay(2026, 0)).toBe(1)
  })

  it('returns 2 when the month starts on a Sunday', () => {
    // Feb 1 2026 is a Sunday
    expect(firstBizDay(2026, 1)).toBe(2)
  })

  it('returns 3 when the month starts on a Saturday', () => {
    // Aug 1 2026 is a Saturday
    expect(firstBizDay(2026, 7)).toBe(3)
  })
})

describe('effectiveDomDate', () => {
  it('returns the date unchanged on a weekday', () => {
    // Jan 15 2026 is a Thursday
    expect(effectiveDomDate(2026, 0, 15)).toEqual(new Date(2026, 0, 15))
  })

  it('shifts a Sunday forward by one day', () => {
    // Feb 1 2026 is a Sunday
    expect(effectiveDomDate(2026, 1, 1)).toEqual(new Date(2026, 1, 2))
  })

  it('shifts a Saturday forward by two days', () => {
    // Aug 1 2026 is a Saturday
    expect(effectiveDomDate(2026, 7, 1)).toEqual(new Date(2026, 7, 3))
  })

  it('returns null when the day number overflows into the next month', () => {
    expect(effectiveDomDate(2026, 0, 32)).toBeNull()
  })
})

describe('nthWeekdayInMonth', () => {
  it('finds the 1st Monday of the month at the given time', () => {
    const result = nthWeekdayInMonth(2026, 0, 1, 1, 9, 0)
    expect(result).toEqual(new Date(2026, 0, 5, 9, 0, 0))
  })

  it('returns null when the nth weekday does not exist in the month', () => {
    // January 2026 only has 4 Mondays
    expect(nthWeekdayInMonth(2026, 0, 1, 5, 9, 0)).toBeNull()
  })
})

describe('computeAlarmSchedule', () => {
  const PRE_MEET_MS = 5000
  const NOTIFY_LEAD_MS = 2 * 60 * 1000

  it('schedules a same_weekday link for the next first-business-day occurrence', () => {
    const now = new Date(2025, 11, 29, 9, 0, 0) // Mon Dec 29 2025
    const link = { id: 'b', link: 'https://zoom.us/b', name: 'FirstBizDay', repeat: 'same_weekday', time: '10:00' }
    const target = new Date(2026, 0, 1, 10, 0, 0) // next first-biz-day: Jan 1 2026 (Thursday, dow 4)

    const entries = computeAlarmSchedule([link], now)

    expect(entries).toHaveLength(2)
    const main = entries.find(e => e.name === 'lj-b-fbm')
    expect(main.whenMs).toBe(target.getTime() - PRE_MEET_MS)
    expect(main.data).toEqual({ id: 'b', link: 'https://zoom.us/b', slug: null, repeat: 'same_weekday', name: 'FirstBizDay', password: null })

    const notify = entries.find(e => e.name === 'lj-notify-b-fbm')
    expect(notify.whenMs).toBe(target.getTime() - NOTIFY_LEAD_MS)
    expect(notify.data.notify).toBe(true)
  })

  it('schedules a "day N" link for the next occurrence of that day-of-month', () => {
    const now = new Date(2026, 0, 5, 8, 0, 0) // Mon Jan 5 2026
    const link = { id: 'c', link: 'https://zoom.us/c', name: 'DayN', repeat: 'day 15', time: '11:00' }
    const target = new Date(2026, 0, 15, 11, 0, 0)

    const entries = computeAlarmSchedule([link], now)

    const main = entries.find(e => e.name === 'lj-c-dom')
    expect(main.whenMs).toBe(target.getTime() - PRE_MEET_MS)
  })

  it('schedules a monthly (nth-weekday) link', () => {
    const now = new Date(2026, 0, 5, 8, 0, 0) // Mon Jan 5 2026
    const link = { id: 'd', link: 'https://zoom.us/d', name: 'Monthly', repeat: 'month', days: ['Mon'], date: '01/05/2026', time: '09:00' }
    const target = new Date(2026, 0, 5, 9, 0, 0) // 1st Monday of Jan 2026, still ahead of 8am

    const entries = computeAlarmSchedule([link], now)

    const main = entries.find(e => e.name === 'lj-d-Mon')
    expect(main.whenMs).toBe(target.getTime() - PRE_MEET_MS)
  })

  it('schedules a plain weekly link', () => {
    const now = new Date(2026, 0, 5, 8, 0, 0) // Mon Jan 5 2026
    const link = { id: 'a', link: 'https://zoom.us/a', name: 'Standup', repeat: '0', days: ['Mon'], time: '09:00' }
    const target = new Date(2026, 0, 5, 9, 0, 0)

    const entries = computeAlarmSchedule([link], now)

    const main = entries.find(e => e.name === 'lj-a-Mon')
    expect(main.whenMs).toBe(target.getTime() - PRE_MEET_MS)
  })

  it('skips a link past its end_date', () => {
    const now = new Date(2026, 0, 5, 8, 0, 0)
    const link = { id: 'e', link: 'https://zoom.us/e', name: 'Ended', repeat: '0', days: ['Mon'], time: '09:00', end_date: '01/01/2026' }
    expect(computeAlarmSchedule([link], now)).toEqual([])
  })

  it('skips an inactive link', () => {
    const now = new Date(2026, 0, 5, 8, 0, 0)
    const link = { id: 'f', link: 'https://zoom.us/f', name: 'Inactive', repeat: '0', days: ['Mon'], time: '09:00', active: 'false' }
    expect(computeAlarmSchedule([link], now)).toEqual([])
  })

  it('carries a slug instead of a link for class-linked (attendance-redacted) meetings', () => {
    const now = new Date(2026, 0, 5, 8, 0, 0)
    const link = { id: 'g', slug: 'c1a2b3', name: 'Class Meeting', repeat: '0', days: ['Mon'], time: '09:00' }
    const entries = computeAlarmSchedule([link], now)
    const main = entries.find(e => e.name === 'lj-g-Mon')
    expect(main.data.slug).toBe('c1a2b3')
    expect(main.data.link).toBeUndefined()
  })
})

describe('buildPremeetParams', () => {
  it('builds slug params for a class-linked meeting', () => {
    const params = buildPremeetParams({ id: 'x', name: 'Class', slug: 'abc123' })
    expect(params.toString()).toBe('name=Class&slug=abc123')
  })

  it('builds link params, including password, for a personal meeting', () => {
    const params = buildPremeetParams({ id: 'y', name: 'Zoom', link: 'https://zoom.us/j/1', password: 'pw1' })
    expect(params.get('link')).toBe('https://zoom.us/j/1')
    expect(params.get('pw')).toBe('pw1')
  })

  it('returns null for a non-http(s) protocol', () => {
    expect(buildPremeetParams({ id: 'z', link: 'javascript:alert(1)' })).toBeNull()
  })

  it('returns null for an unparseable link', () => {
    expect(buildPremeetParams({ id: 'w', link: 'not a url' })).toBeNull()
  })
})
