import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StudentProfile from './StudentProfile.jsx'
import { usersApi } from '../api/users.js'
import { getMyRewards } from '../api/rewards.js'

vi.mock('../components/HeaderModern.jsx', () => ({ default: () => <div /> }))
vi.mock('../api/users.js', () => ({ usersApi: { me: vi.fn() } }))
vi.mock('../api/rewards.js', () => ({ getMyRewards: vi.fn() }))

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderProfile() {
  return render(
    <MemoryRouter>
      <StudentProfile />
    </MemoryRouter>
  )
}

beforeEach(() => {
  usersApi.me.mockResolvedValue({ username: 'student@test.lincoln.edu', name: 'Test Student' })
})

describe('StudentProfile rewards section — premium gating', () => {
  it('shows the upgrade prompt and never fetches rewards when not premium-entitled', async () => {
    mockUseAuth.mockReturnValue({ email: 'student@test.lincoln.edu', role: 'student', isPremium: false })

    renderProfile()

    await waitFor(() => expect(usersApi.me).toHaveBeenCalled())
    expect(screen.getByText(/Attendance history and streaks are a Premium feature/i)).toBeInTheDocument()
    expect(getMyRewards).not.toHaveBeenCalled()
    expect(document.querySelector('.sp-stats-row')).not.toBeInTheDocument()
    expect(document.querySelector('.sp-awards-list')).not.toBeInTheDocument()
  })

  it('fetches and renders real rewards data when premium-entitled', async () => {
    mockUseAuth.mockReturnValue({ email: 'student@test.lincoln.edu', role: 'student', isPremium: true })
    getMyRewards.mockResolvedValue({
      current_streak: 4,
      on_time_sessions: 12,
      total_sessions: 15,
      longest_streak: 6,
      awards: ['first_steps', 'on_point'],
    })

    renderProfile()

    await waitFor(() => expect(getMyRewards).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('.sp-stats-row')).toBeInTheDocument())
    expect(screen.queryByText(/Attendance history and streaks are a Premium feature/i)).not.toBeInTheDocument()
    expect(document.querySelector('.sp-awards-list')).toBeInTheDocument()
  })
})
