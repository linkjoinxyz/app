import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminDashboard from './AdminDashboard.jsx'
import { apiGet } from '../api/client.js'

vi.mock('../components/SideNav.jsx', () => ({ default: () => <div /> }))
vi.mock('../api/client.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiDownload: vi.fn(),
}))

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ role: 'district_admin', orgId: 'district-1' })
})

describe('DistrictAdminView', () => {
  it('renders real school data instead of the "coming soon" stub', async () => {
    apiGet.mockImplementation((path) => {
      if (path === '/orgs/district-1/children') {
        return Promise.resolve([
          { org_id: 'school-a', name: 'Lincoln Elementary', type: 'school', student_count: 120, class_count: 6, open_intervention_count: 2 },
          { org_id: 'school-b', name: 'Washington Middle', type: 'school', student_count: 340, class_count: 14, open_intervention_count: 5 },
        ])
      }
      if (path === '/classes') return Promise.resolve([])
      return Promise.resolve([])
    })

    renderDashboard()

    await waitFor(() => expect(screen.getByText('Lincoln Elementary')).toBeInTheDocument())
    expect(screen.getByText('Washington Middle')).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    // district-wide totals: 120+340 students, 6+14 classes
    expect(screen.getByText('460')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('shows an empty state when the district has no schools yet', async () => {
    apiGet.mockImplementation((path) => {
      if (path === '/orgs/district-1/children') return Promise.resolve([])
      if (path === '/classes') return Promise.resolve([])
      return Promise.resolve([])
    })

    renderDashboard()

    await waitFor(() => expect(screen.getByText(/No schools in this district yet/i)).toBeInTheDocument())
  })

  it('drills into a school to show its classes', async () => {
    apiGet.mockImplementation((path) => {
      if (path === '/orgs/district-1/children') {
        return Promise.resolve([
          { org_id: 'school-a', name: 'Lincoln Elementary', type: 'school', student_count: 120, class_count: 1, open_intervention_count: 0 },
        ])
      }
      if (path === '/classes') {
        return Promise.resolve([
          { class_id: 'c1', org_id: 'school-a', name: 'Algebra II', teacher_name: 'Ms. Rivera', student_ids: ['s1', 's2'] },
        ])
      }
      return Promise.resolve([])
    })

    renderDashboard()

    await waitFor(() => expect(screen.getByText('Lincoln Elementary')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Lincoln Elementary'))

    await waitFor(() => expect(screen.getByText('Algebra II')).toBeInTheDocument())
    expect(screen.getByText(/Ms. Rivera/)).toBeInTheDocument()
  })
})
