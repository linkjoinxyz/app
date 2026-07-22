import { useState, useEffect, useMemo } from 'react'
import { apiPut, apiDelete } from '../../api/client.js'
import { TimeOfDayInput, DayPicker, toUTC, fromUTC, formatTime12 } from './ScheduleControls.jsx'

/**
 * The one place a class's schedule is answered: the weekly pattern, plus one-off
 * exceptions for individual dates.
 *
 * The class schedule is authoritative. Saving it propagates down onto the class's
 * meeting link and every student's copy of it (see propagate_schedule_to_links),
 * which is why the link's own time/day fields are locked once it belongs to a
 * class.
 */
export default function ClassScheduleTab({ cls, onSaved }) {
  const initial = fromUTC(cls.time)
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [period, setPeriod] = useState(initial.period)
  const [days, setDays] = useState(cls.days || [])
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [err, setErr] = useState('')

  const [overrides, setOverrides] = useState(cls.schedule_overrides || [])
  const [ovDate, setOvDate] = useState('')
  const [ovType, setOvType] = useState('cancelled')
  const [ovTime, setOvTime] = useState('')
  const [ovReason, setOvReason] = useState('')
  const [ovErr, setOvErr] = useState('')
  const [ovBusy, setOvBusy] = useState(false)

  useEffect(() => {
    const t = fromUTC(cls.time)
    setHour(t.hour); setMinute(t.minute); setPeriod(t.period)
    setDays(cls.days || [])
    setOverrides(cls.schedule_overrides || [])
  }, [cls.class_id, cls.time, cls.days, cls.schedule_overrides])

  const hasSchedule = Boolean(cls.time) && Boolean((cls.days || []).length)

  function toggleDay(day) {
    setDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
  }

  async function handleSaveSchedule() {
    if (!hour) { setErr('Enter a start time.'); return }
    if (!days.length) { setErr('Pick at least one day.'); return }
    setSaving(true); setErr('')
    try {
      await apiPut(`/classes/${cls.class_id}`, { time: toUTC(hour, minute, period), days })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1600)
      onSaved?.()
    } catch (e) {
      setErr(e?.message || 'Could not save the schedule.')
    }
    setSaving(false)
  }

  async function handleAddOverride() {
    if (!ovDate) { setOvErr('Pick a date.'); return }
    if (ovType === 'late_start' && !ovTime) { setOvErr('Enter the new start time.'); return }
    setOvBusy(true); setOvErr('')
    try {
      const res = await apiPut(`/classes/${cls.class_id}/schedule-override`, {
        date: ovDate,
        type: ovType,
        time: ovType === 'late_start' ? ovTime : null,
        reason: ovReason,
      })
      setOverrides(prev => [...prev.filter(o => o.date !== ovDate), res.override])
      if (res.meets === false) {
        setOvErr(`Saved, but this class does not normally meet on ${ovDate}, so it has no effect.`)
      }
      setOvDate(''); setOvTime(''); setOvReason('')
      onSaved?.()
    } catch (e) {
      setOvErr(e?.message || 'Could not save the override.')
    }
    setOvBusy(false)
  }

  async function handleRemoveOverride(dateStr) {
    try {
      await apiDelete(`/classes/${cls.class_id}/schedule-override/${dateStr}`)
      setOverrides(prev => prev.filter(o => o.date !== dateStr))
      onSaved?.()
    } catch (e) {
      setOvErr(e?.message || 'Could not remove the override.')
    }
  }

  const sortedOverrides = useMemo(
    () => [...overrides].sort((a, b) => a.date.localeCompare(b.date)),
    [overrides],
  )

  return (
    <div className="admin-card">
      {!hasSchedule && (
        <div className="admin-warning" role="status">
          <strong>No schedule set.</strong> Attendance is not being recorded for this class,
          and absence alerts and parent reminders will not send until you set a time and days below.
        </div>
      )}

      <h4 className="admin-card-title">Weekly schedule</h4>
      <p className="admin-hint">
        When this class meets. Attendance and lateness are measured from this time, and the
        class&rsquo;s meeting link opens at it.
      </p>

      <div className="admin-modal-field">
        <label className="admin-modal-label">Start time</label>
        <TimeOfDayInput
          hour={hour} minute={minute} period={period}
          onChange={({ hour: h, minute: m, period: p }) => { setHour(h); setMinute(m); setPeriod(p) }}
          missing
        />
      </div>

      <div className="admin-modal-field">
        <label className="admin-modal-label">Days</label>
        <DayPicker days={days} onToggle={toggleDay} missing />
      </div>

      {err && <div className="admin-error">{err}</div>}
      <div className="admin-modal-actions">
        <button className="admin-btn" onClick={handleSaveSchedule} disabled={saving}>
          {saving ? 'Saving…' : savedFlash ? '✓ Saved' : 'Save schedule'}
        </button>
      </div>

      <hr className="admin-divider" />

      <h4 className="admin-card-title">One-off changes</h4>
      <p className="admin-hint">
        Exceptions for a single date, for a late start or a day this class does not meet.
        A cancelled date is not counted as a missed session. School-wide closures belong in
        the academic calendar instead.
      </p>

      <div className="cal-add-row">
        <input
          className="admin-input cal-date-input" type="date" value={ovDate}
          onChange={e => setOvDate(e.target.value)}
        />
        <select className="admin-input" value={ovType} onChange={e => setOvType(e.target.value)}>
          <option value="cancelled">No class</option>
          <option value="late_start">Late start</option>
        </select>
        {ovType === 'late_start' && (
          <input
            className="admin-input" type="time" value={ovTime}
            onChange={e => setOvTime(e.target.value)} aria-label="New start time"
          />
        )}
        <input
          className="admin-input" type="text" placeholder="Reason (optional)" maxLength={200}
          value={ovReason} onChange={e => setOvReason(e.target.value)}
        />
        <button className="admin-btn" onClick={handleAddOverride} disabled={ovBusy || !ovDate}>
          Add
        </button>
      </div>
      {ovErr && <div className="admin-error">{ovErr}</div>}

      {sortedOverrides.length === 0 ? (
        <div className="admin-empty">No one-off changes.</div>
      ) : (
        <ul className="cal-date-list">
          {sortedOverrides.map(o => (
            <li key={o.date} className="cal-date-item">
              <span>
                {new Date(o.date + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                })}
                {' — '}
                {o.type === 'cancelled' ? 'No class' : `Starts ${formatTime12(o.time)}`}
                {o.reason ? ` (${o.reason})` : ''}
              </span>
              <button
                className="cal-remove-btn" title="Remove"
                onClick={() => handleRemoveOverride(o.date)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
