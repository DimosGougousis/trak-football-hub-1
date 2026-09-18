import { BandType, BANDS } from '@/lib/types'
import { scoreToBand } from '@/lib/rating-engine'

export interface SquadAnalytics {
  totalPlayers: number
  totalAssessments: number
  avgRating: number
  /** One entry per ASSESSMENT. Two assessments of the same child count twice. */
  bandDistribution: Record<string, number>
  /**
   * One entry per assessed PLAYER, taken from their most recent assessment.
   * This is what "squad bands" means to a coach: how the squad currently
   * stands, not how many times each band has been recorded.
   */
  squadBands: Record<string, number>
  /** Players in `players` with at least one rated assessment. */
  assessedPlayers: number
  /** Assessments whose coach_rating was absent. Counted, never banded. */
  unratedAssessments: number
  mostImproved: { name: string; playerId: string; improvement: number } | null
  needsAttention: { name: string; playerId: string; reason: string }[]
}

export function calculateSquadAnalytics(
  players: { id: string; player_name: string }[],
  // Nullable, because PostgREST returns it nullable and the caller was casting
  // that away. coach_rating is a GENERATED column over the six sliders, so in
  // practice it is always present — but a `|| 5` fallback on a column that
  // cannot be null was protecting against nothing while silently rewriting a
  // real 0.0 (six sliders at zero) into "mixed". Absent is not five.
  assessments: { id: string; squad_player_id: string; coach_rating: number | null; created_at: string }[],
): SquadAnalytics {
  const totalPlayers = players.length
  const totalAssessments = assessments.length

  const rated = assessments.filter(a => a.coach_rating != null) as
    { id: string; squad_player_id: string; coach_rating: number; created_at: string }[]
  const unratedAssessments = totalAssessments - rated.length

  // Average rating, over the rated rows only. Counting an absent rating as 0
  // in the numerator while keeping it in the denominator drags the squad
  // average down for a reason that is not about any child's football.
  const avgRating =
    rated.length > 0
      ? Math.round(
          (rated.reduce((sum, a) => sum + a.coach_rating, 0) / rated.length) * 100,
        ) / 100
      : 0

  // Band distribution — initialize all bands to 0
  const bandDistribution: Record<string, number> = {}
  const squadBands: Record<string, number> = {}
  for (const b of BANDS) {
    bandDistribution[b.word.toLowerCase()] = 0
    squadBands[b.word.toLowerCase()] = 0
  }
  for (const a of rated) {
    const band = scoreToBand(a.coach_rating)
    bandDistribution[band] = (bandDistribution[band] || 0) + 1
  }

  // Squad bands: the latest rated assessment per player, and only for players
  // still on the roster. An assessment on a transferred or removed roster row
  // is not part of this coach's squad today.
  const rosterIds = new Set(players.map(p => p.id))
  const latestByPlayer = new Map<string, { rating: number; at: number }>()
  for (const a of rated) {
    if (!rosterIds.has(a.squad_player_id)) continue
    const at = new Date(a.created_at).getTime()
    const seen = latestByPlayer.get(a.squad_player_id)
    if (!seen || at > seen.at) latestByPlayer.set(a.squad_player_id, { rating: a.coach_rating, at })
  }
  for (const { rating } of latestByPlayer.values()) {
    const band = scoreToBand(rating)
    squadBands[band] = (squadBands[band] || 0) + 1
  }
  const assessedPlayers = latestByPlayer.size

  // Group assessments by player, sorted chronologically (oldest first)
  const byPlayer = new Map<string, { rating: number; created_at: string }[]>()
  for (const a of rated) {
    if (!byPlayer.has(a.squad_player_id)) byPlayer.set(a.squad_player_id, [])
    byPlayer.get(a.squad_player_id)!.push({ rating: a.coach_rating, created_at: a.created_at })
  }
  for (const entries of byPlayer.values()) {
    entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  // Player name lookup
  const playerMap = new Map(players.map(p => [p.id, p.player_name]))

  // Most improved: player whose avg rating improved most between first half and second half
  let mostImproved: SquadAnalytics['mostImproved'] = null
  let bestImprovement = 0
  for (const [playerId, entries] of byPlayer) {
    if (entries.length < 2) continue
    const mid = Math.floor(entries.length / 2)
    const firstHalf = entries.slice(0, mid)
    const secondHalf = entries.slice(mid)
    const avgFirst = firstHalf.reduce((s, e) => s + e.rating, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((s, e) => s + e.rating, 0) / secondHalf.length
    const improvement = Math.round((avgSecond - avgFirst) * 100) / 100
    if (improvement > bestImprovement) {
      bestImprovement = improvement
      mostImproved = {
        name: playerMap.get(playerId) || 'Unknown',
        playerId,
        improvement,
      }
    }
  }

  // ── Needs Attention ─────────────────────────────────────────────────────────
  // Players surface here when:
  //
  //   1. They have no assessments at all → 'No assessments recorded'
  //   2. Their last assessment was 14+ days ago → 'No assessment in 14+ days'
  //   3. They have ≥ 6 assessments AND the last 3 avg 1.5+ pts lower than the
  //      previous 3 → 'Declining trend'  (rules 2 and 3 never both fire for
  //      the same player — stale takes priority)
  //
  // Maximum 3 players shown, sorted by severity.

  type Candidate = { name: string; playerId: string; reason: string; severity: number }
  const candidates: Candidate[] = []
  const now = Date.now()
  const fourteenDays = 14 * 24 * 60 * 60 * 1000

  for (const player of players) {
    const entries = byPlayer.get(player.id)

    // Rule 1: no assessments at all
    if (!entries || entries.length === 0) {
      candidates.push({
        name: player.player_name,
        playerId: player.id,
        reason: 'No assessments recorded',
        severity: 1000,
      })
      continue
    }

    const lastDate = new Date(entries[entries.length - 1].created_at).getTime()
    const daysSince = Math.floor((now - lastDate) / (24 * 60 * 60 * 1000))

    // Rule 2: stale — last assessment 14+ days ago
    if (now - lastDate >= fourteenDays) {
      candidates.push({
        name: player.player_name,
        playerId: player.id,
        reason: 'No assessment in 14+ days',
        severity: daysSince,
      })
      continue // don't double-flag
    }

    // Rule 3: declining trend — needs at least 6 assessments, last 3 vs previous 3
    if (entries.length >= 6) {
      const prev3 = entries.slice(-6, -3)
      const last3 = entries.slice(-3)
      const avgPrev = prev3.reduce((s, e) => s + e.rating, 0) / prev3.length
      const avgLast = last3.reduce((s, e) => s + e.rating, 0) / last3.length
      const drop = avgPrev - avgLast
      if (drop >= 1.5) {
        candidates.push({
          name: player.player_name,
          playerId: player.id,
          reason: 'Declining trend',
          severity: drop * 10,
        })
      }
    }
  }

  // Most urgent first, cap at 3
  candidates.sort((a, b) => b.severity - a.severity)
  const needsAttention = candidates.slice(0, 3).map(({ name, playerId, reason }) => ({
    name,
    playerId,
    reason,
  }))

  return {
    totalPlayers,
    totalAssessments,
    avgRating,
    bandDistribution,
    squadBands,
    assessedPlayers,
    unratedAssessments,
    mostImproved,
    needsAttention,
  }
}
