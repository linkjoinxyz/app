import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Pricing from './Pricing.jsx'

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ token: null, logout: vi.fn() }),
}))

function renderPricing() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>
  )
}

describe('Pricing feature-comparison table', () => {
  it('renders all three plan cards', () => {
    renderPricing()
    const names = Array.from(document.querySelectorAll('.plan-name')).map(el => el.textContent)
    expect(names).toEqual(['Individual', 'Premium', 'School'])
  })

  it('marks a Core feature (SMS reminders) available on every tier', () => {
    renderPricing()
    const table = document.querySelector('.compare-table')
    const row = within(table).getByText('SMS reminders').closest('tr')
    const cells = within(row).getAllByRole('cell')
    // [feature name, individual, premium, school]
    expect(within(cells[1]).queryByText('×')).not.toBeInTheDocument()
    expect(within(cells[2]).queryByText('×')).not.toBeInTheDocument()
    expect(within(cells[3]).queryByText('×')).not.toBeInTheDocument()
  })

  it('marks a Premium-tier feature (Vacation mode) unavailable on Individual, available on Premium and School', () => {
    renderPricing()
    const table = document.querySelector('.compare-table')
    const row = within(table).getByText('Vacation mode').closest('tr')
    const cells = within(row).getAllByRole('cell')
    expect(within(cells[1]).getByText('×')).toBeInTheDocument()
    expect(within(cells[2]).queryByText('×')).not.toBeInTheDocument()
    expect(within(cells[3]).queryByText('×')).not.toBeInTheDocument()
  })

  it('marks an Institutional-only feature (Dedicated support) unavailable on Individual and Premium', () => {
    renderPricing()
    const table = document.querySelector('.compare-table')
    const row = within(table).getByText('Dedicated support').closest('tr')
    const cells = within(row).getAllByRole('cell')
    expect(within(cells[1]).getByText('×')).toBeInTheDocument()
    expect(within(cells[2]).getByText('×')).toBeInTheDocument()
    expect(within(cells[3]).queryByText('×')).not.toBeInTheDocument()
  })

  it('renders all three feature-group headers', () => {
    renderPricing()
    const table = document.querySelector('.compare-table')
    expect(within(table).getByText('Core')).toBeInTheDocument()
    expect(within(table).getByText('Automation & AI')).toBeInTheDocument()
    expect(within(table).getByText('Institutional')).toBeInTheDocument()
  })
})
