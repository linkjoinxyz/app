import { describe, it, expect } from 'vitest'
import { firstBizDay as feFirstBizDay, effectiveDomDate as feEffectiveDomDate } from './repeatLogic.js'
import { firstBizDay as extFirstBizDay, effectiveDomDate as extEffectiveDomDate } from '../../../linkjoin-extension/lib/scheduling.js'

// linkjoin-frontend/src/utils/repeatLogic.js and linkjoin-extension/lib/scheduling.js
// each hand-implement the same "does this link's schedule match today" business
// logic independently. Nothing else guarantees they stay in agreement — this test
// is that guarantee.

describe('firstBizDay parity (frontend vs extension)', () => {
  it.each([
    [2026, 0],  // Jan 2026 — starts on a Thursday
    [2026, 1],  // Feb 2026 — starts on a Sunday
    [2026, 2],  // Mar 2026 — starts on a Sunday
    [2026, 7],  // Aug 2026 — starts on a Saturday
    [2026, 11], // Dec 2026
    [2027, 0],  // Jan 1 edge case, next year
    [2024, 1],  // Feb 2024 — leap year
  ])('agrees for year=%i month=%i', (year, month) => {
    expect(feFirstBizDay(year, month)).toBe(extFirstBizDay(year, month))
  })
})

describe('effectiveDomDate parity (frontend vs extension)', () => {
  it.each([
    [2026, 0, 1],   // Jan 1 2026 — weekday, unchanged
    [2026, 0, 15],  // mid-month weekday
    [2026, 1, 1],   // Feb 1 2026 — Sunday, shifts +1
    [2026, 7, 1],   // Aug 1 2026 — Saturday, shifts +2
    [2026, 0, 31],  // last day of a 31-day month
    [2026, 0, 32],  // overflow into next month — both should return null
    [2024, 1, 29],  // Feb 29 on a leap year
    [2026, 1, 29],  // Feb 29 on a non-leap year — overflow, both null
  ])('agrees for year=%i month=%i day=%i', (year, month, day) => {
    const feResult = feEffectiveDomDate(year, month, day)
    const extResult = extEffectiveDomDate(year, month, day)
    if (feResult === null || extResult === null) {
      expect(feResult).toBeNull()
      expect(extResult).toBeNull()
    } else {
      expect(feResult.getTime()).toBe(extResult.getTime())
    }
  })
})
