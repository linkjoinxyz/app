import { describe, it, expect } from 'vitest'
import { trialDaysRemaining, isTrialForExistingAccount } from './utils.js'

describe('trialDaysRemaining', () => {
  const now = new Date('2026-07-23T12:00:00Z')

  it('counts whole days left', () => {
    expect(trialDaysRemaining('2026-07-26T12:00:00Z', now)).toBe(3)
    expect(trialDaysRemaining('2026-07-24T12:00:00Z', now)).toBe(1)
  })

  it('floors at zero once the trial has passed', () => {
    expect(trialDaysRemaining('2026-07-22T12:00:00Z', now)).toBe(0)
  })

  it('reads a naive server timestamp as UTC', () => {
    // Mongo datetimes arrive without a suffix; parsed as local this drifts by
    // the viewer's offset and can show the wrong day near the boundary.
    expect(trialDaysRemaining('2026-07-26T12:00:00', now)).toBe(3)
  })

  it('returns null when there is no trial end', () => {
    expect(trialDaysRemaining(null)).toBeNull()
    expect(trialDaysRemaining(undefined)).toBeNull()
  })
})

/**
 * A new signup gets its trial at registration. A pre-launch account gets one on
 * its next login instead, long after it was created — greeting those people with
 * "Welcome to LinkJoin" reads as if we have forgotten them.
 */
describe('isTrialForExistingAccount', () => {
  it('treats an account with no created_at as existing', () => {
    // The field postdates the oldest accounts entirely.
    expect(isTrialForExistingAccount({ trial_start: '2026-07-23T10:00:00' })).toBe(true)
  })

  it('treats a trial that started with the account as a new signup', () => {
    expect(isTrialForExistingAccount({
      created_at: '2026-07-23T10:00:00',
      trial_start: '2026-07-23T10:00:00',
    })).toBe(false)
  })

  it('treats a trial started long after signup as existing', () => {
    expect(isTrialForExistingAccount({
      created_at: '2024-03-01T10:00:00',
      trial_start: '2026-07-23T10:00:00',
    })).toBe(true)
  })

  it('handles a missing user or trial_start', () => {
    expect(isTrialForExistingAccount(null)).toBe(false)
    expect(isTrialForExistingAccount({ created_at: '2026-07-23T10:00:00' })).toBe(false)
  })
})
