import { describe, it, expect, vi } from 'vitest'
import { createChromeMock } from './mocks/chrome.js'

// Same import-time stubbing rationale as background.test.js.
vi.stubGlobal('chrome', createChromeMock())
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
const { _computeIsPremium } = await import('../background.js')

/**
 * Mirrors roles.is_premium on the server. It decides whether the extension even
 * OFFERS scanning: a free account should never see a "Scan this page" button or
 * an "Analyzing…" spinner, because that call can only come back 403.
 *
 * If this drifts from the server the failure is silent — the feature is offered
 * and then rejected, which is the exact experience this gating removed.
 */
describe('_computeIsPremium', () => {
    it('entitles every institutional account, whatever its premium_status', () => {
        // School plans bundle everything; students and teachers have no
        // premium_status field at all.
        expect(_computeIsPremium({ account_type: 'institutional' })).toBe(true)
        expect(_computeIsPremium({ account_type: 'institutional', premium_status: 'expired' })).toBe(true)
    })

    it('entitles active and grandfathered personal accounts', () => {
        expect(_computeIsPremium({ account_type: 'personal', premium_status: 'active' })).toBe(true)
        expect(_computeIsPremium({ account_type: 'personal', premium_status: 'grandfathered' })).toBe(true)
    })

    it('entitles a trial only while it is still running', () => {
        const future = new Date(Date.now() + 864e5).toISOString()
        const past = new Date(Date.now() - 864e5).toISOString()
        expect(_computeIsPremium({ premium_status: 'trial', trial_end: future })).toBe(true)
        expect(_computeIsPremium({ premium_status: 'trial', trial_end: past })).toBe(false)
        expect(_computeIsPremium({ premium_status: 'trial' })).toBe(false)
    })

    it('reads a naive trial_end as UTC', () => {
        // The server serializes Mongo datetimes without a suffix. Parsed as local
        // this drifts by the viewer's offset, so a trial flips early or late near
        // its boundary depending on where the user is.
        const naiveFuture = new Date(Date.now() + 864e5).toISOString().replace('Z', '')
        expect(_computeIsPremium({ premium_status: 'trial', trial_end: naiveFuture })).toBe(true)
    })

    it('does not entitle a legacy account with no premium_status', () => {
        // ~2400 pre-launch personal accounts are in exactly this state.
        expect(_computeIsPremium({ account_type: 'personal', premium: 'false' })).toBe(false)
        expect(_computeIsPremium({ account_type: 'personal' })).toBe(false)
    })

    it('does not entitle an unknown or missing user', () => {
        expect(_computeIsPremium(null)).toBe(false)
        expect(_computeIsPremium(undefined)).toBe(false)
        expect(_computeIsPremium({})).toBe(false)
    })
})
