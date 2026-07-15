import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import BillingSection from './SettingsBilling.jsx'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('SettingsBilling', () => {
  it('shows a Manage billing button for an active subscriber', () => {
    render(<BillingSection user={{ premium_status: 'active' }} showToast={() => {}} />)
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('Manage billing')).toBeInTheDocument()
  })

  it('shows no action button for a grandfathered account', () => {
    render(<BillingSection user={{ premium_status: 'grandfathered' }} showToast={() => {}} />)
    expect(screen.getByText(/thanks for being an early user/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows days remaining and an Upgrade button during an active trial', () => {
    const trialEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    render(<BillingSection user={{ premium_status: 'trial', trial_end: trialEnd }} showToast={() => {}} />)
    expect(screen.getByText(/Free trial: 5 days left/)).toBeInTheDocument()
    expect(screen.getByText('Upgrade now')).toBeInTheDocument()
  })

  it('shows "Trial ended" once trial_end has passed', () => {
    const trialEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    render(<BillingSection user={{ premium_status: 'trial', trial_end: trialEnd }} showToast={() => {}} />)
    expect(screen.getByText('Trial ended')).toBeInTheDocument()
  })

  it('shows "Individual (free)" with an Upgrade button for an expired/free user', () => {
    render(<BillingSection user={{ premium_status: 'expired' }} showToast={() => {}} />)
    expect(screen.getByText('Individual (free)')).toBeInTheDocument()
    expect(screen.getByText('Upgrade now')).toBeInTheDocument()
  })

  it('calls showToast(false) when checkout fails', async () => {
    server.use(http.post('/api/billing/checkout', () => new HttpResponse(null, { status: 500 })))
    const showToast = vi.fn()
    render(<BillingSection user={{ premium_status: 'expired' }} showToast={showToast} />)
    fireEvent.click(screen.getByText('Upgrade now'))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(false))
  })

  it('redirects to the portal url when Manage billing succeeds', async () => {
    server.use(http.post('/api/billing/portal', () => HttpResponse.json({ url: 'https://billing.stripe.com/portal-session' })))
    const { href, origin, protocol, host, pathname, search } = window.location
    delete window.location
    window.location = { href, origin, protocol, host, pathname, search }

    render(<BillingSection user={{ premium_status: 'active' }} showToast={() => {}} />)
    fireEvent.click(screen.getByText('Manage billing'))

    await waitFor(() => expect(window.location.href).toBe('https://billing.stripe.com/portal-session'))
  })
})
