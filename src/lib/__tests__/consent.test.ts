import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ageFromDateOfBirth,
  needsParentalConsent,
  CONSENT_THRESHOLD_AGE,
  CONSENT_PURPOSES,
} from '@/lib/consent'

/**
 * The boundary here decides whether a child can be assessed without a parent,
 * so an off-by-one is a legal error rather than a cosmetic one. These pin the
 * day either side of the fifteenth birthday.
 */
describe('ageFromDateOfBirth', () => {
  afterEach(() => vi.useRealTimers())

  const freeze = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  it('counts whole years, not elapsed time', () => {
    freeze('2026-09-12T12:00:00Z')
    expect(ageFromDateOfBirth('2011-09-12')).toBe(15)
  })

  it('does not round up the day before a birthday', () => {
    freeze('2026-09-11T12:00:00Z')
    expect(ageFromDateOfBirth('2011-09-12')).toBe(14)
  })

  it('ticks over on the birthday itself', () => {
    freeze('2026-09-12T00:00:01Z')
    expect(ageFromDateOfBirth('2011-09-12')).toBe(15)
  })

  it('handles a birthday later in the same year', () => {
    freeze('2026-03-01T12:00:00Z')
    expect(ageFromDateOfBirth('2011-12-25')).toBe(14)
  })

  it('returns null for an unparseable date rather than guessing', () => {
    expect(ageFromDateOfBirth('not-a-date')).toBeNull()
  })
})

describe('needsParentalConsent', () => {
  afterEach(() => vi.useRealTimers())

  const freeze = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  it('is true below the threshold', () => {
    freeze('2026-09-12T12:00:00Z')
    expect(needsParentalConsent('2012-09-13')).toBe(true) // 13
  })

  it('is false on the day the child reaches the threshold', () => {
    freeze('2026-09-12T12:00:00Z')
    expect(needsParentalConsent('2011-09-12')).toBe(false) // exactly 15
  })

  it('is true on the last day before the threshold', () => {
    freeze('2026-09-11T12:00:00Z')
    expect(needsParentalConsent('2011-09-12')).toBe(true) // 14
  })

  it('is false for an unparseable date, so signup is never blocked by a bad value', () => {
    expect(needsParentalConsent('')).toBe(false)
  })
})

describe('consent purposes', () => {
  it('offers exactly one required purpose, so the rest are genuine choices', () => {
    expect(CONSENT_PURPOSES.filter(p => p.required)).toHaveLength(1)
    expect(CONSENT_PURPOSES.filter(p => !p.required).length).toBeGreaterThan(0)
  })

  it('uses the Greek threshold for the single configured pilot market', () => {
    expect(CONSENT_THRESHOLD_AGE).toBe(15)
  })
})
