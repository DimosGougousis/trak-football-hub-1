import { describe, expect, it } from 'vitest'
import { squadByPosition } from '../by-position'

const p = (id: string, position: string | null, shirt: number | null = null, name = id) => ({ id, player_name: name, position, shirt_number: shirt })

describe('squadByPosition: the Squad page in the season plan look', () => {
  it('clusters players GK, DEF, MID, ATT, each by shirt number, and leaves out empty lines', () => {
    const groups = squadByPosition([p('a', 'Attacker', 9), p('d2', 'Defender', 5), p('d1', 'Defender', 2), p('g', 'Goalkeeper', 1)], new Set())
    expect(groups.map(g => g.key)).toEqual(['GK', 'DEF', 'ATT'])
    expect(groups[1].players.map(x => x.id)).toEqual(['d1', 'd2'])
  })

  it('reads a saved Forward as an attacker', () => {
    expect(squadByPosition([p('f', 'Forward', 11)], new Set())[0]).toMatchObject({ key: 'ATT', players: [{ id: 'f' }] })
  })

  it('puts a player with no shirt number after the numbered ones, by name', () => {
    const groups = squadByPosition([p('z', 'Midfielder', null, 'Zed'), p('b', 'Midfielder', null, 'Ben'), p('n', 'Midfielder', 8)], new Set())
    expect(groups[0].players.map(x => x.id)).toEqual(['n', 'b', 'z'])
  })

  it('ends with players with no position yet, then players waiting for consent', () => {
    const groups = squadByPosition([p('w', 'Defender', 4), p('u', null, 7), p('g', 'Goalkeeper', 1)], new Set(['w']))
    expect(groups.map(g => [g.key, g.players.map(x => x.id)])).toEqual([['GK', ['g']], ['NONE', ['u']], ['WAITING', ['w']]])
  })
})
