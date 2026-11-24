import { slotsOf, type Slot } from '@/lib/games/formations'
import type { XI } from '@/lib/squad/formation-board'

/* The season plan's pitch-ready page (Tarek, 24 Nov): the rules behind its Positions pitch, its next-report pill and
   its Player objectives preview. The pitch is the squad's default formation from Squad › Formations (TRAK-357/360). */

/** The squad's default formation: the biggest format's when it has defaults for more than one. Null when none. */
export function defaultFormation<F extends { isDefault: boolean; format: number }>(formations: F[]): F | null {
  return formations.filter(f => f.isDefault).sort((a, b) => b.format - a.format)[0] ?? null
}

/** Who stands where on the pitch, and everyone else on the bench. A starter who left the squad leaves their place empty. */
export function pitchOf<P extends { id: string }>(formation: { shape: string; starters: XI }, players: P[]) {
  const byId = new Map(players.map(p => [p.id, p]))
  const spots: (Slot & { player: P })[] = slotsOf(formation.shape).flatMap(slot => {
    const player = byId.get(formation.starters[slot.slot])
    return player ? [{ ...slot, player }] : []
  })
  const onPitch = new Set(spots.map(s => s.player.id))
  return { spots, bench: players.filter(p => !onPitch.has(p.id)) }
}

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000

/** The amber pill: "Next report: Sun 29 Nov (in 5 days)", "Report due now", or none left. */
export function nextReportText(due: { dueOn: string | null; next: string | null }, today: string): string {
  if (due.dueOn) return 'Report due now'
  if (!due.next) return 'No report left this season'
  const days = dayNumber(due.next) - dayNumber(today)
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  const date = new Date(`${due.next}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `Next report: ${date} (${when})`
}

/** Players without an objective first, otherwise in the order given (sort is stable). */
export const missingFirst = <P>(players: P[], count: (p: P) => number) => [...players].sort((a, b) => Math.min(count(a), 1) - Math.min(count(b), 1))
