import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TrialEndingBanner from './TrialEndingBanner.jsx'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => mockUseAuth() }))

function renderBanner(auth) {
  mockUseAuth.mockReturnValue(auth)
  return render(<MemoryRouter><TrialEndingBanner /></MemoryRouter>)
}

/**
 * Without this banner a trial just stops: Premium features start 403ing and the
 * extension's scan button re-locks, with nothing having warned them. Every
 * pre-launch account starts its trial on next sign-in, so they all expire within
 * a couple of weeks of each other.
 */
describe('TrialEndingBanner', () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    localStorage.clear()
  })

  it('stays quiet early in the trial', () => {
    const { container } = renderBanner({ premiumStatus: 'trial', trialDaysLeft: 9 })
    expect(container).toBeEmptyDOMElement()
  })

  it('warns inside the last three days', () => {
    renderBanner({ premiumStatus: 'trial', trialDaysLeft: 3 })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/ends in 3 days/i)).toBeInTheDocument()
  })

  it.each([
    [1, /ends tomorrow/i],
    [0, /ends today/i],
  ])('phrases the last days naturally (%i)', (days, pattern) => {
    renderBanner({ premiumStatus: 'trial', trialDaysLeft: days })
    expect(screen.getByText(pattern)).toBeInTheDocument()
  })

  it('never shows for an account that is not on a trial', () => {
    for (const premiumStatus of ['active', 'grandfathered', 'expired', null]) {
      const { container, unmount } = renderBanner({ premiumStatus, trialDaysLeft: 1 })
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('does not render when the day count is unknown', () => {
    const { container } = renderBanner({ premiumStatus: 'trial', trialDaysLeft: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('can be dismissed for the day', () => {
    renderBanner({ premiumStatus: 'trial', trialDaysLeft: 2 })
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('comes back the next day', () => {
    // Dismissal is keyed by date, so it stays out of the way for the session but
    // returns as the deadline gets closer.
    localStorage.setItem('lj_trial_banner_dismissed', '2020-01-01')
    renderBanner({ premiumStatus: 'trial', trialDaysLeft: 2 })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
