import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import UpgradeModal from './UpgradeModal.jsx'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('UpgradeModal', () => {
  it('shows generic copy when no feature name is given', () => {
    render(<UpgradeModal onClose={() => {}} />)
    expect(screen.getByText('Upgrade to Premium')).toBeInTheDocument()
  })

  it('shows feature-specific copy when a feature name is given', () => {
    render(<UpgradeModal feature="Vacation Mode" onClose={() => {}} />)
    expect(screen.getByText('Vacation Mode is part of Premium')).toBeInTheDocument()
  })

  it('redirects to the checkout url on successful upgrade', async () => {
    server.use(
      http.post('/api/billing/checkout', () => HttpResponse.json({ url: 'https://checkout.stripe.com/test-session' }))
    )
    // Location's properties are prototype getters, not own properties, so
    // `{...window.location}` silently drops them — copy the real values by
    // access instead, or fetch's relative-URL resolution breaks too.
    const { href, origin, protocol, host, pathname, search } = window.location
    delete window.location
    window.location = { href, origin, protocol, host, pathname, search }

    render(<UpgradeModal onClose={() => {}} />)
    fireEvent.click(screen.getByText('Upgrade now'))

    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/test-session'))
  })

  it('shows an inline error and re-enables the button on failure', async () => {
    server.use(
      http.post('/api/billing/checkout', () => new HttpResponse(null, { status: 500 }))
    )

    render(<UpgradeModal onClose={() => {}} />)
    const button = screen.getByText('Upgrade now')
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText(/could not start checkout/i)).toBeInTheDocument())
    expect(button).not.toBeDisabled()
  })

  it('calls onClose when "Maybe later" is clicked', async () => {
    const onClose = vi.fn()
    render(<UpgradeModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Maybe later'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
