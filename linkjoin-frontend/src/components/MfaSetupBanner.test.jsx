import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MfaSetupBanner from './MfaSetupBanner.jsx'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => mockUseAuth() }))

function renderAt(path = '/admin/classes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MfaSetupBanner />
    </MemoryRouter>,
  )
}

/**
 * auth.get_confirmed_user 403s an MFA-less admin on everything outside a small
 * allowlist. Pages swallow their fetch errors and render empty states, so the
 * admin dashboard reported "No classes found in your organization" while twelve
 * requests 403'd behind it. This banner is the only thing that tells the user
 * their data is intact and what to do about it.
 */
describe('MfaSetupBanner', () => {
  beforeEach(() => mockUseAuth.mockReset())

  it('explains the lockout to an admin who has not enrolled', () => {
    mockUseAuth.mockReturnValue({ mfaSetupRequired: true })
    renderAt()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Two-factor authentication required/i)).toBeInTheDocument()
    // The reassurance matters: the empty states imply the data is gone.
    expect(screen.getByText(/are safe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set up 2fa/i })).toBeInTheDocument()
  })

  it('renders nothing when the gate does not apply', () => {
    mockUseAuth.mockReturnValue({ mfaSetupRequired: false })
    const { container } = renderAt()
    expect(container).toBeEmptyDOMElement()
  })

  it('stays off public pages even for an admin who needs MFA', () => {
    mockUseAuth.mockReturnValue({ mfaSetupRequired: true })
    const { container } = renderAt('/')
    expect(container).toBeEmptyDOMElement()
  })

  it('drops the redundant CTA once the user is already on settings', () => {
    mockUseAuth.mockReturnValue({ mfaSetupRequired: true })
    renderAt('/settings')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set up 2fa/i })).toBeNull()
  })
})
