import { BANDS, type BandType } from '@/lib/types'
import { scoreToBand } from '@/lib/rating-engine'

/** Open decision in the spec: how many lower assessments in a row before a drop is flagged. */
export const DROP_AFTER = 1

export type AssessmentRow = {
  squad_player_id: string
  coach_rating: number | null
  created_at: string
  work_rate: number
  technical: number
  physical: number
  coachability: number
  attitude: number
  tactical: number
}

/** `move` is 1 when the child went up the BANDS list (towards Exceptional), -1 when down. */
export type BandMove = { squadPlayerId: string; band: BandType; previous: BandType | null; move: -1 | 0 | 1 }

// Position in BANDS: index 0 is Exceptional, so a lower index is a better band.
const bandIndex = (band: BandType) => BANDS.findIndex(b => b.word.toLowerCase() === band)

/** Each child's latest band against their own previous one. Rows in any order; null ratings are skipped. */
export function bandMoves(rows: AssessmentRow[]): Map<string, BandMove> {
  const byChild = new Map<string, AssessmentRow[]>()
  for (const row of rows) {
    if (row.coach_rating == null) continue
    const list = byChild.get(row.squad_player_id)
    if (list) list.push(row)
    else byChild.set(row.squad_player_id, [row])
  }

  const moves = new Map<string, BandMove>()
  for (const [id, list] of byChild) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    const band = scoreToBand(list[list.length - 1].coach_rating as number)
    const previous = list.length > 1 ? scoreToBand(list[list.length - 2].coach_rating as number) : null
    const diff = previous ? bandIndex(previous) - bandIndex(band) : 0
    moves.set(id, { squadPlayerId: id, band, previous, move: diff > 0 ? 1 : diff < 0 ? -1 : 0 })
  }
  return moves
}

/** Every band in BANDS order with the children currently in it. */
export function bandSpread(moves: Map<string, BandMove>): { band: BandType; ids: string[] }[] {
  const all = [...moves.values()]
  return BANDS.map(b => {
    const band = b.word.toLowerCase() as BandType
    return { band, ids: all.filter(m => m.band === band).map(m => m.squadPlayerId) }
  })
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Plain-language coach prompts: drops first (a talk when sessions were also missed), then the rises together. */
export function nextSteps(moves: BandMove[], names: Record<string, string>, missedLast4: Record<string, number>): string[] {
  const nameOf = (id: string) => names[id] ?? 'this player'
  const steps: string[] = []
  for (const m of moves) {
    if (m.move !== -1) continue
    const name = nameOf(m.squadPlayerId)
    steps.push((missedLast4[m.squadPlayerId] ?? 0) >= 3
      ? `Talk to ${name}: a drop and missed sessions.`
      : `Check in with ${name}${name.endsWith('.') ? '' : '.'}`)
  }
  const risers = moves.filter(m => m.move === 1).map(m => nameOf(m.squadPlayerId))
  if (risers.length > 0) steps.push(`Tell ${joinNames(risers)} what they did well.`)
  return steps
}
