import { describe, it, expect } from 'vitest'
import { parseServerDate } from './utils.js'

/**
 * Mongo hands the backend naive datetimes, so `.isoformat()` drops the timezone
 * suffix even though the value is UTC. `new Date()` reads a suffix-less ISO
 * string as LOCAL, so attendance rows rendered the raw UTC clock number: a
 * 9:00 AM Central class displayed as "2:00 PM" for every teacher.
 */
describe('parseServerDate', () => {
  it('reads a naive server datetime as UTC, not local', () => {
    // 14:00 UTC is 09:00 America/Chicago (CDT, -5).
    const d = parseServerDate('2026-07-21T14:00:00')
    expect(d.toISOString()).toBe('2026-07-21T14:00:00.000Z')
    expect(d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
    })).toBe('9:00 AM')
  })

  it('trusts an explicit offset when the server sends one', () => {
    expect(parseServerDate('2026-07-21T14:00:00Z').toISOString()).toBe('2026-07-21T14:00:00.000Z')
    expect(parseServerDate('2026-07-21T09:00:00-05:00').toISOString()).toBe('2026-07-21T14:00:00.000Z')
  })

  it('keeps a date-only value on its own calendar day west of Greenwich', () => {
    // new Date('2026-07-21') is UTC midnight, which is Jul 20 in Chicago.
    const d = parseServerDate('2026-07-21')
    expect(d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })).toBe('7/21/2026')
    expect(d.toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' })).toBe('7/21/2026')
  })

  it('returns null rather than an Invalid Date for empty or junk input', () => {
    expect(parseServerDate('')).toBeNull()
    expect(parseServerDate(null)).toBeNull()
    expect(parseServerDate(undefined)).toBeNull()
    expect(parseServerDate('not a date')).toBeNull()
  })
})
