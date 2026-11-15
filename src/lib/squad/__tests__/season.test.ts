import { describe, it, expect } from 'vitest'
import { seasonWindow } from '../season'

describe('seasonWindow', () => {
  it('runs 1 July to 30 June', () => {
    expect(seasonWindow('2026-10-21')).toEqual({ from: '2026-07-01', to: '2027-06-30', label: 'Season 2026–27' })
    expect(seasonWindow('2027-03-01').label).toBe('Season 2026–27')
    expect(seasonWindow('2027-07-01')).toEqual({ from: '2027-07-01', to: '2028-06-30', label: 'Season 2027–28' })
    expect(seasonWindow('2026-06-30').from).toBe('2025-07-01')
  })
})
