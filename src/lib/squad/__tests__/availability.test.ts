import { describe, it, expect } from 'vitest'
import { splitAvailability, type AvailPlayer } from '../availability'

const p = (id: string, position: string | null = 'Midfielder'): AvailPlayer => ({ id, name: id.toUpperCase(), shirt: null, position })

describe('splitAvailability', () => {
  const players = [p('a'), p('b'), p('c', 'Goalkeeper'), p('d'), p('e', 'Goalkeeper')]

  it('puts a confirmed child with a reported absence in confirmed, marked absent', () => {
    const s = splitAvailability(players, new Set(), new Set(['a', 'b']), new Set(['b']))
    expect(s.confirmed.map(x => [x.id, x.absent])).toEqual([['a', false], ['b', true]])
  })
  it('puts the rest in notConfirmed, marking a reported absence there too', () => {
    const s = splitAvailability(players, new Set(), new Set(['a']), new Set(['d']))
    expect(s.notConfirmed.map(x => [x.id, x.absent])).toEqual([['b', false], ['c', false], ['d', true], ['e', false]])
  })
  it('a consent-pending child is not eligible and nowhere else', () => {
    const s = splitAvailability(players, new Set(['a']), new Set(['a', 'b']), new Set(['a']))
    expect(s.notEligible.map(x => x.id)).toEqual(['a'])
    expect(s.confirmed.map(x => x.id)).toEqual(['b'])
    expect(s.notConfirmed.map(x => x.id)).not.toContain('a')
    expect(s.goalkeepers).toEqual([])
  })
  it('goalkeepers come only from the confirmed', () => {
    const s = splitAvailability(players, new Set(), new Set(['a', 'c']), new Set())
    expect(s.goalkeepers.map(x => x.id)).toEqual(['c'])
  })
})
