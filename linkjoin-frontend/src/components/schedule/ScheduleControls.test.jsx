import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { toUTC, fromUTC, formatTime12, TimeOfDayInput, DayPicker } from './ScheduleControls.jsx'

/**
 * These converters are shared by LinkModal and the class Schedule tab. They must
 * agree: the class schedule is propagated onto its links, so a mismatch here
 * would open the meeting at a different moment than attendance is measured from.
 */
describe('12h <-> 24h conversion', () => {
  it.each([
    [['9', '00', 'AM'], '9:00'],
    [['12', '00', 'AM'], '0:00'],   // midnight is 0, not 12
    [['12', '30', 'PM'], '12:30'],  // noon stays 12
    [['1', '05', 'PM'], '13:05'],
    [['11', '59', 'PM'], '23:59'],
  ])('toUTC(%s) -> %s', (args, expected) => {
    expect(toUTC(...args)).toBe(expected)
  })

  it.each(['9:00', '0:00', '12:30', '13:05', '23:59'])('round-trips %s', (t) => {
    const { hour, minute, period } = fromUTC(t)
    expect(toUTC(hour, minute, period)).toBe(t)
  })

  it('treats an empty time as blank rather than midnight', () => {
    expect(fromUTC('')).toEqual({ hour: '', minute: '00', period: 'AM' })
  })

  it('formats for display', () => {
    expect(formatTime12('13:05')).toBe('1:05 PM')
    expect(formatTime12('0:00')).toBe('12:00 AM')
    expect(formatTime12('')).toBe('')
  })
})

describe('TimeOfDayInput', () => {
  it('reports changes without losing the other fields', () => {
    const onChange = vi.fn()
    render(<TimeOfDayInput hour="9" minute="00" period="AM" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'AM' }))
    expect(onChange).toHaveBeenCalledWith({ hour: '9', minute: '00', period: 'PM' })
  })

  it('strips non-digits from typed input', () => {
    const onChange = vi.fn()
    render(<TimeOfDayInput hour="" minute="00" period="AM" onChange={onChange} />)
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '1a0' } })
    expect(onChange).toHaveBeenCalledWith({ hour: '10', minute: '00', period: 'AM' })
  })

  it('is inert when disabled', () => {
    const onChange = vi.fn()
    render(<TimeOfDayInput hour="9" minute="00" period="AM" onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('button', { name: 'AM' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('DayPicker', () => {
  it('marks selected days as pressed', () => {
    render(<DayPicker days={['Mon', 'Wed']} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Tu' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles the clicked day', () => {
    const onToggle = vi.fn()
    render(<DayPicker days={['Mon']} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'F' }))
    expect(onToggle).toHaveBeenCalledWith('Fri')
  })

  it('is inert when disabled', () => {
    const onToggle = vi.fn()
    render(<DayPicker days={['Mon']} onToggle={onToggle} disabled />)
    fireEvent.click(screen.getByRole('button', { name: 'F' }))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
