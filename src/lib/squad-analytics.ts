import { BandType, BANDS } from '@/lib/types'
import { scoreToBand } from '@/lib/rating-engine'

export interface SquadAnalytics {
  totalPlayers: number
  totalAssessments: number
  avgRating: number
  bandDistribution: Record<string, number>
  mostImproved: { name: string; playerId: string; improvement: number } | null
  needsAttention: { name: string; playerId: string; reason: string }[]
}

export function calculateSquadAnalytics(
  players: { id: string; player_name: string }[],
  assessments: { id: string; squad_player_id: string; coach_rating: number; created_at: string }[],
): SquadAnalytics {
  const totalPlayers = players.length
  const totalAssessments = assessments.length

  // Average rating
  const avgRating =
    totalAssessments > 0
      ? Math.round(
          (assessments.reduce((sum, a) => sum + (a.coach_rating || 0), 0) / totalAssessments) * 100,
        ) / 100
      : 0

  // Band distribution — initialize all bands to 0
  const bandDistribution: Record<string, number> = {}
  for (const b of BANDS) {
    bandDistribution[b.word.toLowerCase()] = 0
  }
  for (const a of assessments) {
    const band = scoreToBand(a.coach_rating || 5)
    bandDistribution[band] = (bandDistribution[band] || 0) + 1
  }

  // Group assessments by player, sorted chronologically (oldest first)
  const byPlayer = new Map<string, { rating: number; created_at: string }[]>()
  for (const a of assessments) {
    if (!byPlayer.has(a.squad_player_id)) byPlayer.set(a.squad_player_id, [])
    byPlayer.get(a.squad_player_id)!.push({ rating: a.coach_rating || 0, created_at: a.created_at })
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
    mostImproved,
    needsAttention,
  }
}
