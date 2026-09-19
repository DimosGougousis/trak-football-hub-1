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

// The age used to be computed with `new Date('YYYY-MM-DD')` — UTC midnight —
// read back through LOCAL getters. In a negative-offset timezone the birth date
// landed on the previous calendar day, so a child whose fifteenth birthday was
// tomorrow read as fifteen and was never asked for a guardian's email.
//
// The database gate is correct (Postgres age() on a date column), so nothing
// unconsented was written. The failure is worse-shaped than that: the child
// completes signup with no parent attached, and every assessment against them
// is then refused by RLS with nothing in the UI to resolve it.
//
// These run in whatever TZ the suite starts in. `npm run test:tz` runs them
// across six, from UTC-8 to UTC+14, which is what actually proves the claim.
describe('age is a calendar comparison, not an instant one', () => {
  // Built from the UTC date, because that is what the server compares against.
  const utcDob = (yearsAgo: number, dayOffset: number) => {
    const now = new Date()
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset))
    return `${d.getUTCFullYear() - yearsAgo}-`
      + `${String(d.getUTCMonth() + 1).padStart(2, '0')}-`
      + `${String(d.getUTCDate()).padStart(2, '0')}`
  }

  it('a child whose 15th birthday is tomorrow still needs consent', () => {
    const dob = utcDob(15, 1)
    expect(ageFromDateOfBirth(dob)).toBe(14)
    expect(needsParentalConsent(dob)).toBe(true)
  })

  it('a child who turned 15 today does not', () => {
    const dob = utcDob(15, 0)
    expect(ageFromDateOfBirth(dob)).toBe(15)
    expect(needsParentalConsent(dob)).toBe(false)
  })

  it('an impossible date is refused rather than rolled over', () => {
    // 31 February used to become 3 March, which is a real age for a date that
    // does not exist. S7/T5 fixed this shape once already.
    expect(ageFromDateOfBirth('2011-02-31')).toBeNull()
    expect(needsParentalConsent('2011-02-31')).toBe(false)
  })
})
