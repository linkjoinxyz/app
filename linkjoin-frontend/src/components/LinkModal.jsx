import { useState, useEffect, useRef } from 'react'
import { linksApi } from '../api/links.js'
import { useModalClose } from '../hooks/useModalClose.js'
import '../styles/modal.css'

const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LABELS = { Sun: 'Su', Mon: 'M', Tue: 'Tu', Wed: 'W', Thu: 'Th', Fri: 'F', Sat: 'Sa' }
const TEXT_OPTIONS = ['false', '5', '10', '15', '20', '30', '45', '60']
const TEXT_LABELS = { false: 'Never', '5': '5 min', '10': '10 min', '15': '15 min', '20': '20 min', '30': '30 min', '45': '45 min', '60': '60 min' }

function _dateFmt(d) {
  if (!d) return ''
  let i = 0, out = ''
  const m0 = d[0]
  if (m0 >= '2') {
    out = m0 + '/'; i = 1
  } else if (d.length > 1) {
    const raw = d.slice(0, 2), n = parseInt(raw)
    out = (n < 1 ? '01' : n > 12 ? '12' : raw) + '/'; i = 2
  } else {
    return m0
  }
  if (i >= d.length) return out
  const day0 = d[i]
  if (day0 >= '4') {
    out += day0 + '/'; i++
  } else if (d.length > i + 1) {
    const raw = d.slice(i, i + 2), n = parseInt(raw)
    out += (n < 1 ? '01' : n > 31 ? '31' : raw) + '/'; i += 2
  } else {
    return out + day0
  }
  if (i >= d.length) return out
  out += d.slice(i, i + 4)
  return out
}

function _dateFmtSimple(d) {
  let v = d
  if (d.length > 2) v = d.slice(0, 2) + '/' + d.slice(2)
  if (d.length > 4) v = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4)
  return v
}

function _dateExpandYear(val) {
  const p = val.split('/')
  if (p.length === 3 && /^\d{2}$/.test(p[2])) return p[0] + '/' + p[1] + '/20' + p[2]
  return val
}

function nextDateForDays(days) {
  if (!days.length) return ''
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const today = new Date()
  let minDiff = 7
  for (const day of days) {
    const diff = (DAYS.indexOf(day) - today.getDay() + 7) % 7
    if (diff < minDiff) minDiff = diff
  }
  const target = new Date(today)
  target.setDate(today.getDate() + minDiff)
  return `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}/${target.getFullYear()}`
}

function toUTC(hour, minute, period) {
  let h = parseInt(hour) || 0
  const m = parseInt(minute) || 0
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return `${h}:${String(m).padStart(2, '0')}`
}

function fromUTC(time24) {
  if (!time24) return { hour: '', minute: '00', period: 'AM' }
  const [h, m] = time24.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return { hour: String(hour), minute: String(m).padStart(2, '0'), period }
}

export default function LinkModal({ visible, editLink, onClose, onSuccess, prefillDays, prefillDate }) {
  const isEdit = Boolean(editLink)
  const { closing, handleClose } = useModalClose(onClose)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [hour, setHour] = useState('')
  const [minute, setMinute] = useState('')
  const [period, setPeriod] = useState('AM')
  const [days, setDays] = useState([ALL_DAYS[new Date().getDay()]])
  const [repeats, setRepeats] = useState('week')
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [customDate, setCustomDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [text, setText] = useState('false')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const minuteRef = useRef(null)

  useEffect(() => {
    if (!visible) return
    if (editLink) {
      const t = fromUTC(editLink.time)
      setName(editLink.name || '')
      setUrl(editLink.link || '')
      setHour(t.hour)
      setMinute(t.minute)
      setPeriod(t.period)
      setDays(Array.isArray(editLink.days) ? editLink.days : [])
      if (/^day \d+$/.test(editLink.repeat)) {
        setRepeats('day')
        setDayOfMonth(parseInt(editLink.repeat.split(' ')[1]))
      } else if (editLink.repeat === 'same_weekday') {
        setRepeats('day')
        setDayOfMonth(1)
      } else {
        setRepeats(editLink.repeat || 'week')
        setDayOfMonth(1)
      }
      setText(editLink.text || 'false')
      setPassword(editLink.password || '')
      setCustomDate(editLink.date || '')
      setEndDate(editLink.end_date || '')
    } else {
      const initialDays = prefillDays || [ALL_DAYS[new Date().getDay()]]
      setName(''); setUrl(''); setHour(''); setMinute('00'); setPeriod('AM')
      setDays(initialDays); setRepeats(prefillDate ? 'never' : 'week')
      setText('false'); setPassword(''); setMinute('')
      setCustomDate(prefillDate || nextDateForDays(initialDays))
      setEndDate('')
    }
    setError('')
  }, [visible, editLink])

  function toggleDay(day) {
    setDays(prev => {
      const next = prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
      if (!editLink) setCustomDate(nextDateForDays(next))
      return next
    })
  }

  async function handleSubmit() {
    if (!name || !url || !hour || (!days.length && repeats !== 'month' && repeats !== 'day')) {
      setError('Please fill in all required fields.')
      return
    }
    if (customDate && endDate) {
      const [smo, sdy, syr] = customDate.split('/').map(Number)
      const [emo, edy, eyr] = endDate.split('/').map(Number)
      if (new Date(eyr, emo - 1, edy) <= new Date(syr, smo - 1, sdy)) {
        setError('End date must be after start date.')
        return
      }
    }
    setLoading(true)
    setError('')
    const time = toUTC(hour, minute, period)
    const finalRepeats = repeats === 'day' ? `day ${dayOfMonth}` : repeats
    let finalDays = days
    if (repeats === 'day') {
      finalDays = ALL_DAYS
    } else if (repeats === 'month' && customDate) {
      const [mo, dy, yr] = customDate.split('/')
      const d = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(dy))
      finalDays = isNaN(d.getDay()) ? days : [ALL_DAYS[d.getDay()]]
    }
    const payload = { name, link: url, time, days: finalDays, repeats: finalRepeats, date: customDate, end_date: endDate || undefined, text, password: password || undefined }
    try {
      if (isEdit) {
        await linksApi.update(editLink.id, { id: editLink.id, ...payload })
      } else {
        await linksApi.create(payload)
      }
      onSuccess()
      handleClose()
    } catch (e) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <div className={`modal-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <img src="/images/arrow-left.svg" className="modal-back" alt="back" onClick={handleClose} />
        <div className="modal-title">{isEdit ? 'Edit meeting' : 'Schedule a meeting'}</div>

        <div className="modal-field">
          <span className="modal-field-tag">Meeting title</span>
          <input
            className="modal-input"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="modal-field">
          <span className="modal-field-tag">Meeting link</span>
          <input
            className="modal-input"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
        </div>
        <div className="modal-field" style={{ marginBottom: 24 }}>
          <span className="modal-field-tag">Password<span className="modal-field-opt">optional</span></span>
          <input
            className="modal-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        <div className="modal-section">
          <span className="modal-field-tag">Time</span>
          <div className="modal-time-row">
            <input
              className="modal-time-input"
              placeholder="1"
              value={hour}
              onKeyDown={e => {
                if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) return
                if (!/^\d$/.test(e.key)) { e.preventDefault(); return }
                if (hour.length >= 2) { e.preventDefault(); return }
              }}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 2)
                setHour(val)
                if (val.length === 1 && parseInt(val) >= 2) minuteRef.current?.focus()
                else if (val.length === 2) minuteRef.current?.focus()
              }}
            />
            <span className="modal-time-sep">:</span>
            <input
              ref={minuteRef}
              className="modal-time-input"
              placeholder="00"
              value={minute}
              onKeyDown={e => {
                if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) return
                if (!/^\d$/.test(e.key)) { e.preventDefault(); return }
                const k = parseInt(e.key)
                if (minute.length === 0 && k > 5) { e.preventDefault(); return }
                if (minute.length >= 2) { e.preventDefault(); return }
              }}
              onChange={e => setMinute(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
            <span
              className="modal-time-period"
              onClick={() => setPeriod(p => p === 'AM' ? 'PM' : 'AM')}
            >{period}</span>
          </div>
        </div>

        {repeats !== 'day' && repeats !== 'month' && (
          <div className="modal-section">
            <span className="modal-field-tag">Days</span>
            <div className="modal-days">
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  className={`modal-day-btn${days.includes(day) ? ' selected' : ''}`}
                  onClick={() => toggleDay(day)}
                >{DAY_LABELS[day]}</button>
              ))}
            </div>
          </div>
        )}

        <div className="modal-fields-row">
          <div className="modal-field-col">
            <span className="modal-field-label">Repeats</span>
            <select className="modal-select" value={repeats} onChange={e => {
              const val = e.target.value
              setRepeats(val)
              if (val === 'day') setDays(ALL_DAYS)
            }}>
              <option value="never">Never</option>
              <option value="week">Every week</option>
              <option value="2 times">Every 2 weeks</option>
              <option value="3 times">Every 3 weeks</option>
              <option value="4 times">Every 4 weeks</option>
              <option value="month">Same date every month</option>
              <option value="day">Day of month</option>
            </select>
            {repeats === 'day' && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="modal-field-opt" style={{ fontSize: 13 }}>Day</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="modal-time-input"
                  style={{ width: 52 }}
                  value={dayOfMonth}
                  onChange={e => {
                    const v = Math.min(31, Math.max(1, parseInt(e.target.value) || 1))
                    setDayOfMonth(v)
                  }}
                />
                <span className="modal-field-opt" style={{ fontSize: 13 }}>of every month</span>
              </div>
            )}
          </div>

          <div className="modal-field-col">
            <span className="modal-field-label">Start date</span>
            <input
              className="modal-date-input"
              placeholder="MM/DD/YYYY"
              value={customDate}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
                const isDelete = digits.length < customDate.replace(/\D/g, '').length
                setCustomDate(isDelete ? _dateFmtSimple(digits) : _dateFmt(digits))
              }}
              onBlur={e => setCustomDate(_dateExpandYear(e.target.value))}
            />
          </div>

          <div className="modal-field-col">
            <span className="modal-field-label">Reminder</span>
            <select className="modal-select" value={text} onChange={e => setText(e.target.value)}>
              {TEXT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{TEXT_LABELS[opt]}</option>
              ))}
            </select>
          </div>
        </div>

        {repeats !== 'never' && (
          <div className="modal-fields-row">
            <div className="modal-field-col">
              <span className="modal-field-label">End date <span className="modal-field-opt">optional</span></span>
              <input
                className="modal-date-input"
                placeholder="MM/DD/YYYY"
                value={endDate}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
                  const isDelete = digits.length < endDate.replace(/\D/g, '').length
                  setEndDate(isDelete ? _dateFmtSimple(digits) : _dateFmt(digits))
                }}
                onBlur={e => setEndDate(_dateExpandYear(e.target.value))}
              />
            </div>
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        <button
          className={`modal-submit${loading ? ' disabled' : ''}`}
          onClick={handleSubmit}
          disabled={loading}
        >
          {isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  )
}
