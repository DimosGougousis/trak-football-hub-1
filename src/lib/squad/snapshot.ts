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
  /** TRAK-200: null while it's the coach's draft. */
  published_at?: string | null
}

/** `move` is 1 when the child went up the BANDS list (towards Exceptional), -1 when down. */
export type BandMove = { squadPlayerId: string; band: BandType; previous: BandType | null; move: -1 | 0 | 1 }

// Position in BANDS: index 0 is Exceptional, so a lower index is a better band.
const bandIndex = (band: BandType) => BANDS.findIndex(b => b.word.toLowerCase() === band)

/**
 * Each child's latest band against their own previous one. Rows in any order; null ratings are skipped.
 * A rise is one step up. A drop (`move: -1`) needs each of the child's last `dropAfter` assessment-to-assessment
 * steps to have gone to a lower band, so it takes `dropAfter + 1` rated assessments; otherwise a lower latest
 * band reads as `move: 0`. `previous` is always the immediately previous band.
 */
export function bandMoves(rows: AssessmentRow[], dropAfter: number = DROP_AFTER): Map<string, BandMove> {
  const byChild = new Map<string, AssessmentRow[]>()
  for (const row of rows) {
    if (row.coach_rating == null) continue
    const list = byChild.get(row.squad_player_id)
    if (list) list.push(row)
    else byChild.set(row.squad_player_id, [row])
  }

  const need = Math.max(1, Math.floor(dropAfter))
  const moves = new Map<string, BandMove>()
  for (const [id, list] of byChild) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    const band = scoreToBand(list[list.length - 1].coach_rating as number)
    const previous = list.length > 1 ? scoreToBand(list[list.length - 2].coach_rating as number) : null
    const idx = list.map(r => bandIndex(scoreToBand(r.coach_rating as number)))
    const last = idx.length - 1
    let move: BandMove['move'] = 0
    if (last >= 1 && idx[last] < idx[last - 1]) move = 1
    else if (last >= need) {
      let dropped = true
      for (let i = last; i > last - need; i--) if (idx[i] <= idx[i - 1]) dropped = false
      if (dropped) move = -1
    }
    moves.set(id, { squadPlayerId: id, band, previous, move })
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
