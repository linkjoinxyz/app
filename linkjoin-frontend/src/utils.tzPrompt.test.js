import { describe, it, expect, beforeEach } from 'vitest'
import { rememberTzPromptDeclined, isTzPromptDeclined, clearTzPromptDeclined } from './utils.js'

describe('timezone prompt decline persistence', () => {
  beforeEach(() => localStorage.clear())

  it('does not suppress the prompt before anything is declined', () => {
    expect(isTzPromptDeclined('America/Chicago', 'America/Denver')).toBe(false)
  })

  it('suppresses the prompt for the exact pair that was declined', () => {
    // The bug: declining was React state only, so the identical prompt came back
    // on every page refresh.
    rememberTzPromptDeclined('America/Chicago', 'America/Denver')
    expect(isTzPromptDeclined('America/Chicago', 'America/Denver')).toBe(true)
  })

  it('still prompts after travelling on to a different timezone', () => {
    rememberTzPromptDeclined('America/Chicago', 'America/Denver')
    expect(isTzPromptDeclined('America/Chicago', 'Asia/Tokyo')).toBe(false)
  })

  it('still prompts when the saved timezone itself changed', () => {
    rememberTzPromptDeclined('America/Chicago', 'America/Denver')
    expect(isTzPromptDeclined('Europe/Berlin', 'America/Denver')).toBe(false)
  })

  it('clears the decline so a later return trip prompts again', () => {
    rememberTzPromptDeclined('America/Chicago', 'America/Denver')
    clearTzPromptDeclined()
    expect(isTzPromptDeclined('America/Chicago', 'America/Denver')).toBe(false)
  })

  it('treats corrupt stored data as not declined rather than throwing', () => {
    localStorage.setItem('lj_tz_prompt_declined', 'not json{')
    expect(() => isTzPromptDeclined('a', 'b')).not.toThrow()
    expect(isTzPromptDeclined('a', 'b')).toBe(false)
  })
})
