import { describe, it, expect } from 'vitest'
import { seasonWindow, seasonSummary, type SeasonRow } from '../season'

const r = (o: Partial<SeasonRow> & { squad_player_id: string }): SeasonRow => ({
  match_date: '2026-09-12', opponent: 'Rivals FC', session_id: null, team_score: 3, opponent_score: 1,
  goals: 0, assists: 0, ...o,
})

describe('seasonWindow', () => {
  it('runs 1 July to 30 June', () => {
    expect(seasonWindow('2026-10-21')).toEqual({ from: '2026-07-01', to: '2027-06-30', label: 'Season 2026–27' })
    expect(seasonWindow('2027-03-01').label).toBe('Season 2026–27')
    expect(seasonWindow('2027-07-01')).toEqual({ from: '2027-07-01', to: '2028-06-30', label: 'Season 2027–28' })
    expect(seasonWindow('2026-06-30').from).toBe('2025-07-01')
  })
})

describe('seasonSummary', () => {
  it('returns empty figures for no rows', () => {
    const s = seasonSummary([])
    expect(s.players).toEqual([])
    expect(s.matches).toEqual([])
    expect(s.record).toEqual({ w: 0, d: 0, l: 0 })
    expect(s.running).toEqual([])
    expect(s.mismatches).toEqual([])
  })

  const rows: SeasonRow[] = [
    r({ squad_player_id: 'a', goals: 2, assists: 1 }),
    r({ squad_player_id: 'b', goals: 1 }),
    r({ match_date: '2026-09-19', opponent: 'Town', team_score: 1, opponent_score: 1, squad_player_id: 'a', goals: 1 }),
    r({ match_date: '2026-09-19', opponent: 'Town', team_score: 1, opponent_score: 1, squad_player_id: 'b' }),
  ]

  it('builds matches, the record and goal totals', () => {
    const s = seasonSummary(rows)
    expect(s.matches.map(m => ({ key: m.key, f: m.for, a: m.against, res: m.result, sg: m.scorerGoals })))
      .toEqual([
        { key: '2026-09-12|Rivals FC', f: 3, a: 1, res: 'W', sg: 3 },
        { key: '2026-09-19|Town', f: 1, a: 1, res: 'D', sg: 1 },
      ])
    expect(s.record).toEqual({ w: 1, d: 1, l: 0 })
    expect(s.goalsFor).toBe(4)
    expect(s.goalsAgainst).toBe(2)
    expect(s.mismatches).toEqual([])
  })

  it('builds the running tally in date order', () => {
    const s = seasonSummary([...rows].reverse())
    expect(s.running).toEqual([
      { date: '2026-09-12', goalsFor: 3, goalsAgainst: 1, w: 1, d: 0, l: 0 },
      { date: '2026-09-19', goalsFor: 4, goalsAgainst: 2, w: 1, d: 1, l: 0 },
    ])
  })

  it('computes apps, goals and assists per player', () => {
    const s = seasonSummary(rows)
    expect(s.players.find(p => p.squadPlayerId === 'a')).toEqual({ squadPlayerId: 'a', apps: 2, goals: 3, assists: 1 })
    expect(s.players.find(p => p.squadPlayerId === 'b')).toEqual({ squadPlayerId: 'b', apps: 2, goals: 1, assists: 0 })
  })

  // Trak does not capture minutes played (Dimos, 22 Oct): the RPC still returns the column, and nothing reads it.
  it('has no minutes figures, and a match logged with or without minutes counts the same', () => {
    const withMinutes = [{ ...r({ squad_player_id: 'a', goals: 3 }), minutes_played: 48 }, { ...r({ squad_player_id: 'b' }), minutes_played: null }]
    const s = seasonSummary(withMinutes)
    expect(s).toEqual(seasonSummary([r({ squad_player_id: 'a', goals: 3 }), r({ squad_player_id: 'b' })]))
    expect(s.record).toEqual({ w: 1, d: 0, l: 0 })
    expect(s.players.map(p => p.apps)).toEqual([1, 1])
    for (const gone of ['minutes', 'matchesWithoutMinutes']) expect(s).not.toHaveProperty(gone)
    expect(s.matches[0]).not.toHaveProperty('availableMinutes')
    for (const gone of ['minutes', 'available', 'pct']) expect(s.players[0]).not.toHaveProperty(gone)
  })

  it('flags a match where the scorers do not add up to the team score', () => {
    const s = seasonSummary([r({ squad_player_id: 'a', goals: 2 }), r({ squad_player_id: 'b', goals: 0 })])
    expect(s.mismatches).toHaveLength(1)
    expect(s.mismatches[0]).toMatchObject({ for: 3, scorerGoals: 2 })
  })

  it('tells a loss', () => {
    const s = seasonSummary([r({ squad_player_id: 'a', team_score: 0, opponent_score: 2 })])
    expect(s.record).toEqual({ w: 0, d: 0, l: 1 })
  })

  it('keeps same-day matches apart, and handles a null opponent', () => {
    const s = seasonSummary([r({ squad_player_id: 'a', opponent: 'X' }), r({ squad_player_id: 'a', opponent: null })])
    expect(s.matches.map(m => m.key).sort()).toEqual(['2026-09-12|', '2026-09-12|X'])
  })
})
