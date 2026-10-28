import { describe, expect, it } from 'vitest'
import { formatDateTime, formatHours, formatPower, inputToIso, isoToInput } from './format'

describe('formatPower', () => {
  it('uses GW from 1000 MW and MW below', () => {
    expect(formatPower(1836.4)).toBe('1.84 GW')
    expect(formatPower(820.4)).toBe('820 MW')
  })
  it('signs only when asked, and always marks negatives', () => {
    expect(formatPower(1645, { signed: true })).toBe('+1.65 GW')
    expect(formatPower(-300)).toBe('−300 MW')
    expect(formatPower(0, { signed: true })).toBe('0 MW')
  })
  it('shows a dash for missing values', () => {
    expect(formatPower(null)).toBe('–')
  })
})

describe('time helpers', () => {
  it('formats hours', () => {
    expect(formatHours(4)).toBe('4h')
    expect(formatHours(5.55)).toBe('5.5h')
  })
  it('formats in UTC regardless of the machine time zone', () => {
    expect(formatDateTime('2026-01-10T12:00:00Z')).toBe('Sat 10 Jan, 12:00')
  })
  it('round-trips datetime-local values as UTC', () => {
    expect(isoToInput('2026-01-07T23:30:00Z')).toBe('2026-01-07T23:30')
    expect(inputToIso('2026-01-07T23:30')).toBe('2026-01-07T23:30:00Z')
  })
})
