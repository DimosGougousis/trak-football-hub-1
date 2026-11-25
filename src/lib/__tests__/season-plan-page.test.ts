import { describe, expect, it } from 'vitest'
import { defaultFormation, missingFirst, nextReportText, pitchOf } from '@/lib/season-plan-page'

describe('season plan pitch-ready page', () => {
  it('picks the default formation, the biggest format first, and none without a default', () => {
    expect(defaultFormation([{ id: 'a', isDefault: true, format: 7 }, { id: 'b', isDefault: true, format: 11 }, { id: 'c', isDefault: false, format: 11 }])?.id).toBe('b')
    expect(defaultFormation([{ id: 'c', isDefault: false, format: 11 }])).toBeNull()
  })

  it('keeps every place of the shape: starters on it, empty places and a starter who left as empty, the rest on the bench', () => {
    const players = [{ id: 'gk' }, { id: 'd1' }, { id: 'sub' }]
    const { spots, bench } = pitchOf({ shape: '2-2', starters: { 1: 'gk', 2: 'd1', 3: 'gone' } }, players)
    expect(spots.map(s => [s.slot, s.player?.id ?? null])).toEqual([[1, 'gk'], [2, 'd1'], [3, null], [4, null], [5, null]])
    expect(bench.map(p => p.id)).toEqual(['sub'])
  })

  it('words the next report', () => {
    expect(nextReportText({ dueOn: '2026-11-22', next: '2026-12-27' }, '2026-11-24')).toBe('Report due now')
    expect(nextReportText({ dueOn: null, next: '2026-11-29' }, '2026-11-24')).toBe('Next report: Sun 29 Nov (in 5 days)')
    expect(nextReportText({ dueOn: null, next: '2026-11-25' }, '2026-11-24')).toBe('Next report: Wed 25 Nov (tomorrow)')
    expect(nextReportText({ dueOn: null, next: null }, '2026-11-24')).toBe('No report left this season')
  })

  it('lists players without objectives first and keeps the rest in order', () => {
    const counts: Record<string, number> = { ann: 2, bob: 0, cat: 1, dan: 0 }
    expect(missingFirst(['ann', 'bob', 'cat', 'dan'], p => counts[p])).toEqual(['bob', 'dan', 'ann', 'cat'])
  })
})
