import { computeMatchScore } from '@/lib/rating-engine'
import { goalsKey, assistsKey } from '@/lib/match-input-keys'

/** The roster's free-text position as the rating engine's four. */
export function mapPosition(raw: string | null) {
  const p = (raw || '').toLowerCase()
  if (p.includes('goalkeeper') || p === 'gk') return 'gk'
  if (p.includes('defender')   || ['def','cb','lb','rb'].includes(p)) return 'def'
  if (p.includes('attacker')   || ['att','cf','st','lw','rw'].includes(p)) return 'att'
  return 'mid'
}

/**
 * One player's match rating, as the coach's match log saves it. Shared by the
 * log and TRAK-185's edit, so a corrected match is rated exactly as a new one.
 */
export function matchRating(m: {
  position: string | null
  competition: string
  venue: string
  opponent: string
  scoreUs: number
  scoreThem: number
  card: string
  goals: number
  assists: number
}) {
  const pos = mapPosition(m.position)
  return computeMatchScore({
    position:        pos,
    competition:     m.competition.toLowerCase() as 'league' | 'cup' | 'friendly',
    venue:           m.venue.toLowerCase() as 'home' | 'away',
    opponent:        m.opponent.trim(),
    score_us:        m.scoreUs,
    score_them:      m.scoreThem,
    // TRAK-198: no log asks minutes; they save as "not recorded".
    minutes_played:  null,
    card:            m.card.toLowerCase() as 'none' | 'yellow' | 'red',
    body_condition:  'good',
    self_rating:     'average',
    position_inputs: {
      /* Position-aware, and assists have their own scale. The engine
         reads '1'/'2'/'3+' for an attacker's goals but '1'/'2+' for
         everyone's assists, so one shared helper for both would send an
         attacker's third assist as '3+' — a key the assists branch has
         no case for, which pays exactly nothing. */
      goals:   goalsKey(pos, m.goals),
      assists: assistsKey(m.assists),
    },
    is_friendly: m.competition === 'Friendly',
  })
}
