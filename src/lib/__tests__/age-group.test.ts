import { describe, it, expect } from 'vitest'
import { ageInYears, ageGroupCeiling, ageGroupMatches, lowestEligibleAgeGroup } from '@/lib/age-group'

const on = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('ageInYears', () => {
  it('counts whole years', () => {
    expect(ageInYears('2010-09-19', on('2026-09-19'))).toBe(16)
  })

  it('does not credit the birthday a day early', () => {
    // The off-by-one that would let a child into a younger band for one day.
    expect(ageInYears('2010-09-20', on('2026-09-19'))).toBe(15)
    expect(ageInYears('2010-09-19', on('2026-09-18'))).toBe(15)
  })

  it('handles a 29 February birthday in a non-leap year', () => {
    expect(ageInYears('2008-02-29', on('2026-02-28'))).toBe(17)
    expect(ageInYears('2008-02-29', on('2026-03-01'))).toBe(18)
  })

  it('rejects dates that do not exist rather than rolling them over', () => {
    // The bug class S7/T5 already fixed once: 31 February silently becoming 3 March.
    expect(ageInYears('2010-02-31', on('2026-09-19'))).toBeNull()
    expect(ageInYears('2010-13-01', on('2026-09-19'))).toBeNull()
  })

  it('returns null for junk and for the future', () => {
    expect(ageInYears('', on('2026-09-19'))).toBeNull()
    expect(ageInYears('not-a-date', on('2026-09-19'))).toBeNull()
    expect(ageInYears('2030-01-01', on('2026-09-19'))).toBeNull()
  })
})

describe('ageGroupCeiling', () => {
  it('reads the number out of a closed band', () => {
    expect(ageGroupCeiling('U13')).toBe(13)
    expect(ageGroupCeiling('U19')).toBe(19)
  })

  it('treats the open band and anything unrecognised as no ceiling', () => {
    expect(ageGroupCeiling('U19+')).toBeNull()
    expect(ageGroupCeiling('Seniors')).toBeNull()
    expect(ageGroupCeiling('')).toBeNull()
  })
})

describe('ageGroupMatches', () => {
  it('allows playing up', () => {
    // A 12-year-old in U15 is ordinary youth football, not a defect.
    expect(ageGroupMatches('2014-01-01', 'U15', on('2026-09-19'))).toBe(true)
    expect(ageGroupMatches('2014-01-01', 'U19+', on('2026-09-19'))).toBe(true)
  })

  it('refuses playing down, which is the direction that matters', () => {
    // A 16-year-old cannot be in U13. This is the case that makes the age band
    // contradict the date of birth the consent gate reads.
    expect(ageGroupMatches('2010-01-01', 'U13', on('2026-09-19'))).toBe(false)
    expect(ageGroupMatches('2010-01-01', 'U16', on('2026-09-19'))).toBe(false)
  })

  it('is exact at the boundary', () => {
    // Under 17 means under 17. Someone who turned 17 today is not eligible.
    expect(ageGroupMatches('2009-09-19', 'U17', on('2026-09-19'))).toBe(false)
    expect(ageGroupMatches('2009-09-20', 'U17', on('2026-09-19'))).toBe(true)
  })

  it('permits what it cannot evaluate, so it never blocks a signup blindly', () => {
    expect(ageGroupMatches('', 'U13', on('2026-09-19'))).toBe(true)
    expect(ageGroupMatches('garbage', 'U13', on('2026-09-19'))).toBe(true)
    expect(ageGroupMatches('2010-01-01', '', on('2026-09-19'))).toBe(true)
  })

  it('accepts the reported case, which was never the defect', () => {
    // "born in 2000 playing for U19+" — 26 years old in the open band is fine.
    expect(ageGroupMatches('2000-05-05', 'U19+', on('2026-09-19'))).toBe(true)
  })
})

describe('lowestEligibleAgeGroup', () => {
  it('names the youngest band a player may join', () => {
    expect(lowestEligibleAgeGroup('2014-01-01', on('2026-09-19'))).toBe('U13')
    expect(lowestEligibleAgeGroup('2010-01-01', on('2026-09-19'))).toBe('U17')
    expect(lowestEligibleAgeGroup('2000-01-01', on('2026-09-19'))).toBe('U19+')
  })

  it('says nothing when it cannot tell', () => {
    expect(lowestEligibleAgeGroup('', on('2026-09-19'))).toBeNull()
  })
})
