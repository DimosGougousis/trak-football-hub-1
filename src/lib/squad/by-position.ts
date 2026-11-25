/** The Squad page's clusters, in the season plan's order (GK, DEF, MID, ATT), then anyone with no position yet, then
 *  anyone waiting for consent. Within a cluster, by shirt number; players with no number follow, by name. Empty
 *  clusters are left out. */
export type ClusterKey = 'GK' | 'DEF' | 'MID' | 'ATT' | 'NONE' | 'WAITING'

const LINE: Record<string, ClusterKey> = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'ATT', Forward: 'ATT' }
const ORDER: ClusterKey[] = ['GK', 'DEF', 'MID', 'ATT', 'NONE', 'WAITING']

type Clusterable = { id: string; player_name: string; position: string | null; shirt_number: number | null }

export function squadByPosition<P extends Clusterable>(players: P[], waiting: Set<string>): { key: ClusterKey; players: P[] }[] {
  const keyOf = (p: P): ClusterKey => (waiting.has(p.id) ? 'WAITING' : LINE[p.position ?? ''] ?? 'NONE')
  const byShirt = (a: P, b: P) => (a.shirt_number ?? Infinity) - (b.shirt_number ?? Infinity) || a.player_name.localeCompare(b.player_name)
  return ORDER.map(key => ({ key, players: players.filter(p => keyOf(p) === key).sort(byShirt) })).filter(g => g.players.length > 0)
}
