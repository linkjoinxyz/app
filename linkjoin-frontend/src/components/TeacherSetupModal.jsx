import { useState } from 'react'
import { apiFetch } from '../api/client.js'
import '../styles/teacher-setup.css'

const TOTAL_STEPS = 3

function StepDots({ step }) {
  return (
    <div className="ts-progress">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`ts-step-dot${i < step ? ' ts-step-dot--done' : i === step ? ' ts-step-dot--active' : ''}`}
        />
      ))}
    </div>
  )
}

export default function TeacherSetupModal({ onDone }) {
  const [step, setStep] = useState(0)
  const [className, setClassName] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [meetingName, setMeetingName] = useState('')
  const [studentEmails, setStudentEmails] = useState('')
  const [classId, setClassId] = useState(null)
  const [linkId, setLinkId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function dismiss() {
    localStorage.setItem('lj_teacher_setup_done', 'true')
    onDone()
  }

  async function handleStep1() {
    if (!className.trim()) { setError('Class name is required.'); return }
    setError('')
    setLoading(true)
    try {
      const cls = await apiFetch('/classes', { method: 'POST', body: JSON.stringify({ name: className.trim() }) })
      setClassId(cls.class_id)
      setMeetingName(className.trim())
      setStep(1)
    } catch {
      setError('Failed to create class. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleStep2() {
    if (!meetingUrl.trim()) { setStep(2); return }
    setError('')
    setLoading(true)
    try {
      const link = await apiFetch('/links', {
        method: 'POST',
        body: JSON.stringify({ name: meetingName.trim() || className.trim(), link: meetingUrl.trim(), time: '', days: [], repeats: 'weekly' }),
      })
      const newLinkId = link.id ?? link.link_id
      setLinkId(newLinkId)
      if (classId && newLinkId != null) {
        await apiFetch(`/classes/${classId}/links/${newLinkId}`, { method: 'POST' }).catch(() => {})
      }
      setStep(2)
    } catch {
      setError('Could not save meeting link. Check the URL and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleStep3() {
    if (!studentEmails.trim() || !classId) {
      finish()
      return
    }
    setError('')
    setLoading(true)
    const emails = studentEmails
      .split(/[\n,]+/)
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
    try {
      await apiFetch(`/classes/${classId}/students`, {
        method: 'POST',
        body: JSON.stringify({ student_ids: emails }),
      })
    } catch {
      setError('Some students could not be added. You can add them from the Classes page later.')
    } finally {
      setLoading(false)
      finish()
    }
  }

  function finish() {
    setDone(true)
    localStorage.setItem('lj_teacher_setup_done', 'true')
    setTimeout(() => onDone(), 1400)
  }

  return (
    <div className="ts-overlay" onClick={dismiss}>
      <div className="ts-modal" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="ts-success">
            <div className="ts-success-icon">&#10003;</div>
            <div className="ts-title">You're all set!</div>
            <p className="ts-sub">Your class is ready. Students will see their meeting link when they log in.</p>
          </div>
        ) : (
          <>
            <StepDots step={step} />

            {step === 0 && (
              <>
                <p className="ts-eyebrow">Step 1 of 3</p>
                <h2 className="ts-title">Name your class</h2>
                <p className="ts-sub">This is what your students will see.</p>
                <div className="ts-field">
                  <label className="ts-label">Class name</label>
                  <input
                    className="ts-input"
                    placeholder="e.g. English 10, Period 3"
                    value={className}
                    onChange={e => { setClassName(e.target.value); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleStep1()}
                    autoFocus
                  />
                  {error && <p className="ts-error">{error}</p>}
                </div>
                <div className="ts-actions">
                  <button className="ts-btn-primary" onClick={handleStep1} disabled={loading}>
                    {loading ? 'Creating...' : 'Continue'}
                  </button>
                  <button className="ts-btn-skip" onClick={dismiss}>Skip setup</button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <p className="ts-eyebrow">Step 2 of 3</p>
                <h2 className="ts-title">Add your meeting link</h2>
                <p className="ts-sub">Paste your Zoom, Google Meet, or Teams URL. Students will use this to join class.</p>
                <div className="ts-field">
                  <label className="ts-label">Meeting URL</label>
                  <input
                    className="ts-input"
                    placeholder="https://zoom.us/j/..."
                    value={meetingUrl}
                    onChange={e => { setMeetingUrl(e.target.value); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleStep2()}
                    autoFocus
                  />
                  {error && <p className="ts-error">{error}</p>}
                </div>
                <div className="ts-actions">
                  <button className="ts-back" onClick={() => setStep(0)}>Back</button>
                  <button className="ts-btn-primary" onClick={handleStep2} disabled={loading}>
                    {loading ? 'Saving...' : meetingUrl.trim() ? 'Continue' : 'Skip'}
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="ts-eyebrow">Step 3 of 3</p>
                <h2 className="ts-title">Add students</h2>
                <p className="ts-sub">Enter student email addresses, one per line or separated by commas. You can also add students later from the Classes page.</p>
                <div className="ts-field">
                  <label className="ts-label">Student emails</label>
                  <textarea
                    className="ts-input"
                    placeholder={"student1@school.edu\nstudent2@school.edu"}
                    value={studentEmails}
                    onChange={e => { setStudentEmails(e.target.value); setError('') }}
                    autoFocus
                  />
                  {error && <p className="ts-error">{error}</p>}
                </div>
                <div className="ts-actions">
                  <button className="ts-back" onClick={() => setStep(1)}>Back</button>
                  <button className="ts-btn-primary" onClick={handleStep3} disabled={loading}>
                    {loading ? 'Adding...' : studentEmails.trim() ? 'Finish setup' : 'Skip'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
