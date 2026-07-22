import { describe, it, expect } from 'vitest'
import { isReturningUser, WHATS_NEW_RELEASED } from './utils.js'

/**
 * "What's new" is for people who used the product before these features existed.
 *
 * Personal signups were already covered, because the trial-welcome modal marks
 * whats_new_seen on its way out. Institutional users are not: import_staff,
 * import_org_members and accept_invite create accounts with neither
 * premium_status nor whats_new_seen, so every student, teacher and admin a
 * school onboarded got a "What's new" modal on their very first login.
 */
describe('isReturningUser', () => {
  it('excludes an account created after the release', () => {
    expect(isReturningUser({ created_at: '2026-07-15T10:00:00' })).toBe(false)
  })

  it('includes an account created before the release', () => {
    expect(isReturningUser({ created_at: '2026-06-01T10:00:00' })).toBe(true)
  })

  it('treats a legacy account with no created_at as returning', () => {
    // The field postdates some accounts; those are certainly older than the release.
    expect(isReturningUser({ username: 'old@x.test' })).toBe(true)
  })

  it('reads created_at as UTC, not local', () => {
    // Naive server timestamps: a boundary account must not flip based on the
    // viewer's offset.
    const justBefore = { created_at: '2026-06-30T23:00:00' }
    expect(isReturningUser(justBefore, '2026-07-01T00:00:00Z')).toBe(true)
    const justAfter = { created_at: '2026-07-01T01:00:00' }
    expect(isReturningUser(justAfter, '2026-07-01T00:00:00Z')).toBe(false)
  })

  it('handles a missing user', () => {
    expect(isReturningUser(null)).toBe(false)
    expect(isReturningUser(undefined)).toBe(false)
  })

  it('exports a parseable release date', () => {
    expect(isNaN(new Date(WHATS_NEW_RELEASED).getTime())).toBe(false)
  })
})
