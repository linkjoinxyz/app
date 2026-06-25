import { describe, it, expect } from 'vitest'
import { shouldOpenThisWeek, shouldOpenNow, effectiveDomDate, minutesUntilNext } from './repeatLogic.js'

// Helper: build a Date for a given YYYY-MM-DD at a given HH:MM
function d(ymd, hhmm = '00:00') {
  const [y, mo, dd] = ymd.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(y, mo - 1, dd, h, m, 0, 0)
}

// Base link for "same date every month" tests
function monthLink(dateStr, days, time = '10:00') {
  return { repeat: 'month', date: dateStr, days, time, active: 'true' }
}

// ─── shouldOpenThisWeek — 'month' repeat ─────────────────────────────────────

describe('month repeat — week-1 reference (date = 07/01/2026, Wed)', () => {
  const link = monthLink('07/01/2026', ['Wed'])

  it('opens on the correct day in week 1 of the same month', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-01'))).toBe(true)  // Jul 1 = Wed, week 1
  })

  it('opens on the same relative day in week 1 of a later month', () => {
    expect(shouldOpenThisWeek(link, d('2026-08-05'))).toBe(true)  // Aug 5 = Wed, week 1
    expect(shouldOpenThisWeek(link, d('2026-09-02'))).toBe(true)  // Sep 2 = Wed, week 1
  })

  it('does not open in week 2', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-08'))).toBe(false) // Jul 8 = Wed, week 2
    expect(shouldOpenThisWeek(link, d('2026-08-12'))).toBe(false) // Aug 12 = Wed, week 2
  })

  it('does not open in week 3, 4, or 5', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-15'))).toBe(false) // week 3
    expect(shouldOpenThisWeek(link, d('2026-07-22'))).toBe(false) // week 4
    expect(shouldOpenThisWeek(link, d('2026-07-29'))).toBe(false) // week 5
  })

  it('still passes for other days in week 1 (day filter handled outside)', () => {
    // shouldOpenThisWeek only checks the week, not the exact day — the caller checks link.days
    expect(shouldOpenThisWeek(link, d('2026-07-03'))).toBe(true)  // Fri, week 1
    expect(shouldOpenThisWeek(link, d('2026-07-07'))).toBe(true)  // Tue, week 1
  })
})

describe('month repeat — week-3 reference (date = 07/15/2026)', () => {
  const link = monthLink('07/15/2026', ['Wed'])

  it('opens in week 3 of each month', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-15'))).toBe(true)  // Jul 15, week 3
    expect(shouldOpenThisWeek(link, d('2026-08-19'))).toBe(true)  // Aug 19, week 3
    expect(shouldOpenThisWeek(link, d('2026-09-16'))).toBe(true)  // Sep 16, week 3
  })

  it('does not open in week 1, 2, or 4', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-01'))).toBe(false) // week 1
    expect(shouldOpenThisWeek(link, d('2026-07-08'))).toBe(false) // week 2
    expect(shouldOpenThisWeek(link, d('2026-07-22'))).toBe(false) // week 4
  })
})

describe('month repeat — week-4 reference (date = 07/22/2026)', () => {
  const link = monthLink('07/22/2026', ['Wed'])

  it('opens in week 4', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-22'))).toBe(true)
    expect(shouldOpenThisWeek(link, d('2026-08-26'))).toBe(true)  // Aug 26, week 4
  })

  it('does not open in week 1 or 3', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-01'))).toBe(false)
    expect(shouldOpenThisWeek(link, d('2026-07-15'))).toBe(false)
  })
})

describe('month repeat — no date falls back to week 1', () => {
  const link = { repeat: 'month', date: '', days: ['Mon'], time: '10:00', active: 'true' }

  it('opens in week 1 when no reference date', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-06'))).toBe(true)  // Jul 6 = Mon, week 1
    expect(shouldOpenThisWeek(link, d('2026-07-01'))).toBe(true)  // week 1
  })

  it('does not open in week 2+ when no reference date', () => {
    expect(shouldOpenThisWeek(link, d('2026-07-13'))).toBe(false) // week 2
  })
})

// ─── shouldOpenNow — full check including days and time ─────────────────────

describe('shouldOpenNow — month repeat', () => {
  // July 1, 2026 is a Wednesday
  const link = monthLink('07/01/2026', ['Wed'], '10:00')

  it('opens at the exact time on the correct weekday in week 1', () => {
    expect(shouldOpenNow(link, d('2026-07-01', '10:00'))).toBe(true)
  })

  it('does not open on the correct day/week but wrong time', () => {
    expect(shouldOpenNow(link, d('2026-07-01', '11:00'))).toBe(false)
    expect(shouldOpenNow(link, d('2026-07-01', '09:59'))).toBe(false)
  })

  it('does not open on the wrong weekday even if week is right', () => {
    // Thursday in week 1 — week passes but link.days = ['Wed'] excludes Thu
    expect(shouldOpenNow(link, d('2026-07-02', '10:00'))).toBe(false) // Thu
  })

  it('does not open in week 2 even on a Wednesday', () => {
    expect(shouldOpenNow(link, d('2026-07-08', '10:00'))).toBe(false) // Wed week 2
  })

  it('opens on the 1st Wednesday in the following month', () => {
    // Aug 5, 2026 = Wednesday, week 1
    expect(shouldOpenNow(link, d('2026-08-05', '10:00'))).toBe(true)
  })

  it('does not open when link is inactive', () => {
    const inactive = { ...link, active: 'false' }
    expect(shouldOpenNow(inactive, d('2026-07-01', '10:00'))).toBe(false)
  })
})

// ─── effectiveDomDate — weekend shift ────────────────────────────────────────

describe('effectiveDomDate weekend shift', () => {
  it('returns the date as-is for weekdays', () => {
    const result = effectiveDomDate(2026, 6, 1)  // July 1, 2026 = Wed
    expect(result.getDate()).toBe(1)
    expect(result.getDay()).toBe(3) // Wed
  })

  it('shifts Saturday to Monday (+2)', () => {
    // Find a Saturday: July 4, 2026 = Saturday
    const result = effectiveDomDate(2026, 6, 4)
    expect(result.getDate()).toBe(6) // Monday July 6
    expect(result.getDay()).toBe(1)
  })

  it('shifts Sunday to Monday (+1)', () => {
    // July 5, 2026 = Sunday
    const result = effectiveDomDate(2026, 6, 5)
    expect(result.getDate()).toBe(6) // Monday July 6
    expect(result.getDay()).toBe(1)
  })

  it('returns null for day beyond end of month', () => {
    expect(effectiveDomDate(2026, 1, 30)).toBeNull() // Feb 30
    expect(effectiveDomDate(2026, 3, 31)).toBeNull() // Apr 31
  })
})

// ─── minutesUntilNext — month repeat ─────────────────────────────────────────

describe('minutesUntilNext — month repeat week-1 (date = 07/01/2026, Wed 10:00)', () => {
  // July 1 2026 = Wednesday, week 1
  const link = monthLink('07/01/2026', ['Wed'], '10:00')

  it('returns a finite value from the day before the occurrence', () => {
    const mins = minutesUntilNext(link, d('2026-06-30', '10:00')) // Tue before
    expect(mins).not.toBe(Infinity)
    expect(mins).toBeGreaterThan(0)
    // ~1 day away = 1440 mins
    expect(mins).toBeCloseTo(1440, -1)
  })

  it('returns a finite value from within the same week (wrong day, right week)', () => {
    // Friday July 3, week 1 — next Wed is July 8 week 2, but Jul 1 Wed week 1 is past.
    // Next matching Wed in week 1 is Aug 5
    const mins = minutesUntilNext(link, d('2026-07-03', '10:00')) // Fri week 1
    expect(mins).not.toBe(Infinity)
    expect(mins).toBeGreaterThan(0)
  })

  it('returns Infinity for a non-matching day (Sun) in week 1', () => {
    // The link's day is Wed only. A Sunday link would return Infinity.
    const sunLink = monthLink('07/05/2026', ['Sun'], '10:00') // Sun week 1
    // From Mon July 6 at 10:00, next Sun week 1 is Aug 2
    const mins = minutesUntilNext(sunLink, d('2026-07-07', '10:00'))
    expect(mins).not.toBe(Infinity)
    expect(mins).toBeGreaterThan(0)
  })
})

describe('minutesUntilNext — month repeat week-3 (date = 07/15/2026, Wed 10:00)', () => {
  const link = monthLink('07/15/2026', ['Wed'], '10:00')

  it('returns a finite value from a week-1 Wednesday (wrong week)', () => {
    // July 1 is Wed week 1 — next week-3 Wed is July 15
    const mins = minutesUntilNext(link, d('2026-07-01', '10:00'))
    expect(mins).not.toBe(Infinity)
    expect(mins).toBeGreaterThan(0)
    expect(mins).toBeCloseTo(14 * 1440, -1) // 14 days away
  })

  it('returns a finite value just before the week-3 occurrence', () => {
    const mins = minutesUntilNext(link, d('2026-07-14', '10:00')) // day before
    expect(mins).not.toBe(Infinity)
    expect(mins).toBeCloseTo(1440, -1)
  })

  it('does NOT return Infinity for week-3 links (regression guard)', () => {
    const mins = minutesUntilNext(link, d('2026-07-01', '09:00'))
    expect(mins).not.toBe(Infinity)
  })
})

describe('minutesUntilNext — week repeat (sanity)', () => {
  const link = { repeat: 'week', date: '', days: ['Wed'], time: '10:00', active: 'true' }

  it('returns ~1 day from the day before', () => {
    const mins = minutesUntilNext(link, d('2026-07-01', '10:00')) // Wed — next Wed is 7 days
    expect(mins).toBeCloseTo(7 * 1440, -1)
  })
})

// ─── weekly repeat always opens ──────────────────────────────────────────────

describe('non-monthly repeats', () => {
  it('week repeat always passes shouldOpenThisWeek', () => {
    const link = { repeat: 'week', days: ['Mon'], time: '9:00', active: 'true' }
    expect(shouldOpenThisWeek(link, d('2026-07-01'))).toBe(true)
    expect(shouldOpenThisWeek(link, d('2026-07-28'))).toBe(true)
  })

  it('never repeat passes shouldOpenThisWeek (disabled by caller)', () => {
    const link = { repeat: 'never', days: ['Mon'], time: '9:00', active: 'true' }
    expect(shouldOpenThisWeek(link, d('2026-07-01'))).toBe(true)
  })
})
