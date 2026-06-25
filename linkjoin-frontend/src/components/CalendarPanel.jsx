import { useState, useMemo } from 'react'
import '../styles/calendar-panel.css'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function effectiveDomDate(year, month, dayNum) {
  const d = new Date(year, month, dayNum)
  if (d.getMonth() !== month) return null
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() + 2)
  if (dow === 0) d.setDate(d.getDate() + 1)
  return d
}
const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function mmddyyyyToIso(str) {
  if (!str) return null
  const [m, d, y] = str.split('/')
  if (!m || !d || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function getMeetingsForDate(links, date) {
  const dayName = DOW[date.getDay()]
  const iso = date.toISOString().slice(0, 10)

  return links.filter(l => {
    if (l.repeat === 'never') {
      return mmddyyyyToIso(l.date) === iso
    }

    if (!Array.isArray(l.days) || !l.days.includes(dayName)) return false

    // Stop showing after end date
    if (l.end_date) {
      const endIso = mmddyyyyToIso(l.end_date)
      if (endIso && iso > endIso) return false
    }

    if (!l.repeat || l.repeat === 'week') return true

    if (l.repeat === 'month') {
      return date.getDate() <= 7
    }

    if (/^day \d+$/.test(l.repeat)) {
      const dayNum = parseInt(l.repeat.split(' ')[1])
      const eff = effectiveDomDate(date.getFullYear(), date.getMonth(), dayNum)
      return eff !== null && date.getDate() === eff.getDate() && date.getMonth() === eff.getMonth()
    }

    if (l.repeat === 'same_weekday') {
      const d1dow = new Date(date.getFullYear(), date.getMonth(), 1).getDay()
      const fbd = d1dow === 0 ? 2 : d1dow === 6 ? 3 : 1
      return date.getDate() === fbd
    }

    const n = parseInt(l.repeat)
    if (n > 1 && l.date) {
      const start = new Date(mmddyyyyToIso(l.date) + 'T00:00:00')
      const diffDays = Math.round((date - start) / 86400000)
      if (diffDays < 0) return false
      return Math.round(diffDays / 7) % n === 0
    }

    return true
  })
}

function buildMonthCells(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  return cells
}

export default function CalendarPanel({ links = [], onEditLink, onAddForDay }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(null)

  const cells = useMemo(() => buildMonthCells(year, month), [year, month])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  const selectedMeetings = selectedDate ? getMeetingsForDate(links, selectedDate) : []

  const dayLabel = selectedDate
    ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''

  return (
    <div className="cal-panel">
      <div className="cal-inner">

        {/* Month grid */}
        <div className="cal-header">
          <span className="cal-title">{MONTHS[month]} {year}</span>
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
            <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          </div>
        </div>

        <div className="cal-dow">
          {DOW_LABELS.map(d => <span key={d}>{d}</span>)}
        </div>

        <div className="cal-grid">
          {cells.map((date, i) => {
            if (!date) return <div key={`e-${i}`} className="cal-cell cal-empty"><div className="cal-date" /></div>
            const meetings = getMeetingsForDate(links, date)
            const isToday = date.toDateString() === today.toDateString()
            const shown = meetings.slice(0, 3)
            const hasMore = meetings.length > 3
            return (
              <div
                key={date.toISOString()}
                className={`cal-cell${isToday ? ' cal-today' : ''}${meetings.length > 0 ? ' cal-has-events' : ''}`}
                onClick={() => setSelectedDate(date)}
              >
                <div className="cal-date">{date.getDate()}</div>
                {meetings.length > 0 && (
                  <div className="cal-dots">
                    {shown.map((_, di) => <div key={di} className="cal-dot" />)}
                    {hasMore && <div className="cal-dot-more" />}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Day view — slides in over the grid */}
        <div className={`cal-day-view${selectedDate ? ' visible' : ''}`}>
          <div className="cal-day-header">
            <button className="cal-back-btn" onClick={() => setSelectedDate(null)}>‹</button>
            <span className="cal-day-title">{dayLabel}</span>
            <button
              className="cal-add-btn"
              onClick={() => { setSelectedDate(null); onAddForDay?.(selectedDate) }}
            >+ Add</button>
          </div>
          <div className="cal-day-list">
            {selectedMeetings.length === 0 && (
              <div className="cal-day-empty">No meetings this day</div>
            )}
            {selectedMeetings.map(l => (
              <div key={l.id} className="cal-event" onClick={() => onEditLink?.(l)}>
                <div className="cal-event-dot" />
                <div className="cal-event-info">
                  <div className="cal-event-name">{l.name}</div>
                  <div className="cal-event-time">{formatTime(l.time)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
