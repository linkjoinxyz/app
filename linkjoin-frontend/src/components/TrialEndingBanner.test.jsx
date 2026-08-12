import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TrialEndingBanner from './TrialEndingBanner.jsx'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => mockUseAuth() }))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateSpy,
}))

function renderBanner(auth, path = '/meetings') {
  mockUseAuth.mockReturnValue(auth)
  return render(
    <MemoryRouter initialEntries={[path]}><TrialEndingBanner /></MemoryRouter>
  )
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
    navigateSpy.mockReset()
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

  it('phrases the last day naturally', () => {
    renderBanner({ premiumStatus: 'trial', trialDaysLeft: 1 })
    expect(screen.getByText(/ends tomorrow/i)).toBeInTheDocument()
  })

  /**
   * trialDaysRemaining ceils, so a trial still running always has at least 1 day
   * left: 0 means it is already over. This said "ends today" for as long as the
   * account stayed on premium_status 'trial' — days or weeks past the fact, not
   * only on the final day.
   */
  it('says the trial has ended once it is over, not "ends today"', () => {
    renderBanner({ premiumStatus: 'trial', trialDaysLeft: 0 })
    expect(screen.getByText(/your free trial has ended/i)).toBeInTheDocument()
    expect(screen.queryByText(/ends today/i)).toBeNull()
  })

  /**
   * /pricing is the marketing page; the actual upgrade button lives in the
   * Billing section of Settings, so the CTA used to land a paying-intent user
   * one more click away from checkout.
   */
  it.each([0, 2])('sends the upgrade action to Billing in Settings (%i days left)', (days) => {
    renderBanner({ premiumStatus: 'trial', trialDaysLeft: days })
    fireEvent.click(screen.getByRole('button', { name: /upgrade|see plans/i }))
    expect(navigateSpy).toHaveBeenCalledWith('/settings#billing')
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

  it('stays off public marketing pages even when the trial is ending', () => {
    const { container } = renderBanner({ premiumStatus: 'trial', trialDaysLeft: 1 }, '/')
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
