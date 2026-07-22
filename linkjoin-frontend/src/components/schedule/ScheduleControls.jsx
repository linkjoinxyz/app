/**
 * The time-of-day and day-of-week controls, shared by LinkModal (a link's own
 * schedule) and the class Schedule tab (the class schedule, which is
 * authoritative and propagates down onto its links).
 *
 * Extracted rather than duplicated precisely because the two must agree: a class
 * at 09:00 whose link says 09:05 opens five minutes late for every student and
 * records all of them tardy.
 *
 * Note toUTC/fromUTC do no timezone maths despite the names inherited from
 * LinkModal; they convert between a 12-hour form and the "H:MM" 24-hour string
 * that both `link.time` and `class.time` store.
 */
export const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LABELS = { Sun: 'Su', Mon: 'M', Tue: 'Tu', Wed: 'W', Thu: 'Th', Fri: 'F', Sat: 'Sa' }

export function toUTC(hour, minute, period) {
  let h = parseInt(hour) || 0
  const m = parseInt(minute) || 0
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return `${h}:${String(m).padStart(2, '0')}`
}

export function fromUTC(time24) {
  if (!time24) return { hour: '', minute: '00', period: 'AM' }
  const [h, m] = time24.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return { hour: String(hour), minute: String(m).padStart(2, '0'), period }
}

/** Display helper: "9:00" -> "9:00 AM". */
export function formatTime12(time24) {
  if (!time24) return ''
  const { hour, minute, period } = fromUTC(time24)
  return `${hour}:${minute} ${period}`
}

export function TimeOfDayInput({ hour, minute, period, onChange, disabled = false, missing = false }) {
  // Uses the same modal-time-* classes LinkModal does, so the hour/minute/period
  // lay out inline rather than stacking as three full-width fields.
  return (
    <div className={`modal-time-row${disabled ? ' modal-locked' : ''}`}>
      <input
        className={`modal-time-input${missing && !hour ? ' modal-missing' : ''}`}
        type="text" inputMode="numeric" maxLength={2} placeholder="12"
        value={hour} disabled={disabled}
        onChange={e => onChange({ hour: e.target.value.replace(/\D/g, '').slice(0, 2), minute, period })}
      />
      <span className="modal-time-sep">:</span>
      <input
        className="modal-time-input"
        type="text" inputMode="numeric" maxLength={2} placeholder="00"
        value={minute} disabled={disabled}
        onChange={e => onChange({ hour, minute: e.target.value.replace(/\D/g, '').slice(0, 2), period })}
      />
      <button
        type="button" className="modal-time-period" disabled={disabled}
        onClick={() => onChange({ hour, minute, period: period === 'AM' ? 'PM' : 'AM' })}
      >
        {period}
      </button>
    </div>
  )
}

export function DayPicker({ days, onToggle, disabled = false, missing = false }) {
  return (
    <div className={`modal-days${missing && !days.length ? ' modal-missing-days' : ''}${disabled ? ' modal-locked' : ''}`}>
      {ALL_DAYS.map(day => (
        <button
          key={day} type="button" disabled={disabled}
          className={`modal-day-btn${days.includes(day) ? ' selected' : ''}`}
          aria-pressed={days.includes(day)}
          onClick={() => onToggle(day)}
        >
          {DAY_LABELS[day]}
        </button>
      ))}
    </div>
  )
}
