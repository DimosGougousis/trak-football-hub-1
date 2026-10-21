export type SeasonRow = {
  match_date: string
  opponent: string | null
  session_id: string | null
  team_score: number
  opponent_score: number
  squad_player_id: string
  minutes_played: number | null
  goals: number
  assists: number
}

/** The season runs 1 July to 30 June; the label names both years, e.g. "Season 2026–27". */
export function seasonWindow(todayISO: string): { from: string; to: string; label: string } {
  const year = Number(todayISO.slice(0, 4))
  const month = Number(todayISO.slice(5, 7))
  const start = month >= 7 ? year : year - 1
  return {
    from: `${start}-07-01`,
    to: `${start + 1}-06-30`,
    label: `Season ${start}–${String(start + 1).slice(2)}`,
  }
}

export type SeasonMatch = {
  key: string
  date: string
  opponent: string | null
  sessionId: string | null
  for: number
  against: number
  result: 'W' | 'D' | 'L'
  availableMinutes: number | null
  scorerGoals: number
}

export type PlayerSeason = {
  squadPlayerId: string
  apps: number
  minutes: number | null
  available: number | null
  pct: number | null
  goals: number
  assists: number
}

const matchKey = (r: SeasonRow) => `${r.match_date}|${r.opponent ?? ''}`

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function seasonSummary(rows: SeasonRow[]): {
  matches: SeasonMatch[]
  players: PlayerSeason[]
  record: { w: number; d: number; l: number }
  goalsFor: number
  goalsAgainst: number
  minutes: { lowest: number; highest: number; median: number } | null
  matchesWithoutMinutes: number
  running: { date: string; goalsFor: number; goalsAgainst: number; w: number; d: number; l: number }[]
  mismatches: SeasonMatch[]
} {
  // One match per date and opponent, built from the rows of the children who played in it.
  const grouped = new Map<string, SeasonRow[]>()
  for (const row of rows) {
    const key = matchKey(row)
    const list = grouped.get(key)
    if (list) list.push(row)
    else grouped.set(key, [row])
  }

  const matches: SeasonMatch[] = [...grouped.entries()].map(([key, list]) => {
    const first = list[0]
    const minutes = list.map(r => r.minutes_played).filter((m): m is number => m !== null)
    const result: SeasonMatch['result'] =
      first.team_score > first.opponent_score ? 'W' : first.team_score < first.opponent_score ? 'L' : 'D'
    return {
      key,
      date: first.match_date,
      opponent: first.opponent,
      sessionId: first.session_id,
      for: first.team_score,
      against: first.opponent_score,
      result,
      availableMinutes: minutes.length > 0 ? Math.max(...minutes) : null,
      scorerGoals: list.reduce((sum, r) => sum + r.goals, 0),
    }
  }).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))

  const availableByMatch = new Map(matches.map(m => [m.key, m.availableMinutes]))

  const perPlayer = new Map<string, PlayerSeason>()
  for (const row of rows) {
    const p = perPlayer.get(row.squad_player_id) ?? {
      squadPlayerId: row.squad_player_id, apps: 0, minutes: null, available: null, pct: null, goals: 0, assists: 0,
    }
    p.apps += 1
    p.goals += row.goals
    p.assists += row.assists
    const matchAvailable = availableByMatch.get(matchKey(row)) ?? null
    if (row.minutes_played !== null) {
      p.minutes = (p.minutes ?? 0) + row.minutes_played
      if (matchAvailable !== null) p.available = (p.available ?? 0) + matchAvailable
    }
    perPlayer.set(row.squad_player_id, p)
  }
  const players = [...perPlayer.values()].map(p => ({
    ...p,
    pct: p.minutes !== null && p.available ? Math.round((p.minutes / p.available) * 100) : null,
  }))

  const pcts = players.map(p => p.pct).filter((v): v is number => v !== null).sort((a, b) => a - b)

  const record = { w: 0, d: 0, l: 0 }
  let goalsFor = 0
  let goalsAgainst = 0
  const running = matches.map(m => {
    record[m.result === 'W' ? 'w' : m.result === 'D' ? 'd' : 'l'] += 1
    goalsFor += m.for
    goalsAgainst += m.against
    return { date: m.date, goalsFor, goalsAgainst, ...record }
  })

  return {
    matches,
    players,
    record,
    goalsFor,
    goalsAgainst,
    minutes: pcts.length > 0 ? { lowest: pcts[0], highest: pcts[pcts.length - 1], median: median(pcts) } : null,
    matchesWithoutMinutes: matches.filter(m => m.availableMinutes === null).length,
    running,
    mismatches: matches.filter(m => m.scorerGoals !== m.for),
  }
}
