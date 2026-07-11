import { useState, useEffect } from 'react'
import { useModalClose } from '../hooks/useModalClose.js'
import { getMyRewards } from '../api/rewards.js'
import '../styles/student-profile.css'

const AWARD_META = {
  first_steps:      { label: 'First Steps',       color: '#6B7280', desc: 'Attended your first class' },
  on_point:         { label: 'On Point',           color: '#2B8FD8', desc: 'Joined a class on time' },
  streak_5:         { label: '5-Day Streak',       color: '#7C3AED', desc: '5 consecutive on-time days' },
  perfect_week:     { label: 'Perfect Week',       color: '#D97706', desc: 'On time all week' },
  streak_10:        { label: '10-Day Streak',      color: '#059669', desc: '10 consecutive on-time days' },
  monthly_champion: { label: 'Monthly Champion',   color: '#DC2626', desc: '20 consecutive on-time days' },
}

const ALL_AWARDS = ['first_steps', 'on_point', 'perfect_week', 'streak_5', 'streak_10', 'monthly_champion']

export default function StudentProfileModal({ onClose }) {
  const { closing, handleClose } = useModalClose(onClose)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getMyRewards()
      .then(setData)
      .catch(() => setError('Could not load rewards.'))
      .finally(() => setLoading(false))
  }, [])

  const earned = new Set(data?.awards || [])
  const pct = data ? Math.round((data.on_time_sessions / Math.max(data.total_sessions, 1)) * 100) : 0

  return (
    <div className={`modal-overlay${closing ? ' closing' : ''}`} onClick={() => handleClose()}>
      <div className="modal-card sp-card" onClick={e => e.stopPropagation()}>
        <button className="sp-close" onClick={() => handleClose()} aria-label="Close">✕</button>

        <h2 className="sp-title">My Rewards</h2>

        {loading && <div className="sp-loading">Loading...</div>}
        {error && <div className="sp-error">{error}</div>}

        {data && (
          <>
            <div className="sp-stats">
              <div className="sp-stat sp-stat--streak">
                <div className="sp-stat-value">{data.current_streak}</div>
                <div className="sp-stat-label">day streak</div>
              </div>
              <div className="sp-stat-divider" />
              <div className="sp-stat">
                <div className="sp-stat-value">{data.on_time_sessions}</div>
                <div className="sp-stat-label">on time</div>
              </div>
              <div className="sp-stat-divider" />
              <div className="sp-stat">
                <div className="sp-stat-value">{pct}%</div>
                <div className="sp-stat-label">on-time rate</div>
              </div>
              <div className="sp-stat-divider" />
              <div className="sp-stat">
                <div className="sp-stat-value">{data.longest_streak}</div>
                <div className="sp-stat-label">best streak</div>
              </div>
            </div>

            <div className="sp-section-label">Awards</div>
            <div className="sp-awards">
              {ALL_AWARDS.map(key => {
                const meta = AWARD_META[key]
                const unlocked = earned.has(key)
                return (
                  <div key={key} className={`sp-award${unlocked ? ' sp-award--earned' : ' sp-award--locked'}`}>
                    <div
                      className="sp-award-badge"
                      style={unlocked ? { background: meta.color } : undefined}
                    >
                      {meta.label.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="sp-award-info">
                      <div className="sp-award-name">{meta.label}</div>
                      <div className="sp-award-desc">{meta.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
