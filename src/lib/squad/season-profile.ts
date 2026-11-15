import { ATTRIBUTES, type AttributeKey } from './attributes'
import type { AssessmentRow } from './snapshot'

export type Scores = Record<AttributeKey, number>

const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (list: Scores[]): Scores =>
  Object.fromEntries(ATTRIBUTES.map(([key]) => [key, round1(list.reduce((sum, s) => sum + s[key], 0) / list.length)])) as Scores

/**
 * TRAK-263 (Imad, 22 Oct): the season radar on a player's profile. Each player's average per attribute over this
 * season's assessments (from `from`, the season's 1 July, out of 10), and the squad's: the mean of the players'
 * averages, so a player assessed often counts no more than one assessed twice. `dateOf` turns a timestamp into the
 * academy's calendar date (YYYY-MM-DD).
 */
export function seasonAverages(rows: AssessmentRow[], from: string, dateOf: (iso: string) => string): {
  players: Map<string, { scores: Scores; count: number }>
  squad: Scores | null
} {
  const byPlayer = new Map<string, Scores[]>()
  for (const row of rows) {
    if (!row.created_at || dateOf(row.created_at) < from) continue
    const scores = Object.fromEntries(ATTRIBUTES.map(([key]) => [key, row[key]])) as Scores
    byPlayer.set(row.squad_player_id, [...(byPlayer.get(row.squad_player_id) ?? []), scores])
  }
  const players = new Map([...byPlayer].map(([id, list]) => [id, { scores: mean(list), count: list.length }]))
  return { players, squad: players.size ? mean([...players.values()].map(p => p.scores)) : null }
}
