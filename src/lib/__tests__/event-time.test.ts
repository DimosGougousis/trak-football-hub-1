import { describe, it, expect } from 'vitest'
import { toInstant, localParts, isTimeTBC, normalizeInstant } from '../event-time'

describe('event time round-trip', () => {
  it('gives back the wall clock the coach typed, whatever zone the run is in', () => {
    const iso = toInstant('2026-03-01', '18:00')
    expect(localParts(iso)).toEqual({ date: '2026-03-01', time: '18:00' })
  })

  it('produces a real instant carrying an offset, not a naive string', () => {
    const iso = toInstant('2026-03-01', '18:00')
    expect(iso).toMatch(/Z$/)
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false)
  })

  it('does not store the typed time as though it were UTC', () => {
    // The old bug: `${date}T${time}:00` handed straight to timestamptz.
    const naive = '2026-03-01T18:00:00'
    const iso = toInstant('2026-03-01', '18:00')
    const offsetMinutes = new Date('2026-03-01T12:00:00').getTimezoneOffset()
    if (offsetMinutes !== 0) {
      expect(iso.slice(11, 16)).not.toBe(naive.slice(11, 16))
    }
    // Either way the instant must be the local 18:00.
    expect(new Date(iso).getHours()).toBe(18)
  })

  it('treats a blank time as local midnight and reports it as TBC', () => {
    const iso = toInstant('2026-03-01', null)
    expect(isTimeTBC(iso)).toBe(true)
    expect(localParts(iso).time).toBe('00:00')
  })

  it('does not call a real evening kick-off TBC', () => {
    expect(isTimeTBC(toInstant('2026-03-01', '18:00'))).toBe(false)
  })

  it('survives a date near a month boundary', () => {
    expect(localParts(toInstant('2026-12-31', '23:30'))).toEqual({ date: '2026-12-31', time: '23:30' })
    expect(localParts(toInstant('2026-01-01', '00:30'))).toEqual({ date: '2026-01-01', time: '00:30' })
  })

  it('returns empty parts for an unparseable value rather than throwing', () => {
    expect(localParts('not a date')).toEqual({ date: '', time: '' })
    expect(isTimeTBC('not a date')).toBe(true)
  })
})

describe('normalizeInstant', () => {
  it('reads a naive parser string as local wall clock, not as UTC', () => {
    const iso = normalizeInstant('2026-03-01T18:00:00')!
    expect(localParts(iso)).toEqual({ date: '2026-03-01', time: '18:00' })
  })

  it('leaves a value that already carries an offset alone', () => {
    const already = '2026-03-01T18:00:00Z'
    expect(normalizeInstant(already)).toBe(new Date(already).toISOString())
  })

  it('handles a date with no time at all', () => {
    expect(localParts(normalizeInstant('2026-03-01')!).time).toBe('00:00')
  })

  it('returns null for empty or unusable input', () => {
    expect(normalizeInstant(null)).toBeNull()
    expect(normalizeInstant('')).toBeNull()
  })
})
