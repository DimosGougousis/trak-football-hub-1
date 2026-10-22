export type AvailPlayer = { id: string; name: string; shirt: number | null; position: string | null }

/**
 * Splits a squad for one event. A child still waiting on consent is not eligible and appears nowhere
 * else. A reported absence is only a flag: the child stays in the confirmed or not-confirmed list.
 * Goalkeepers are the confirmed children whose position is Goalkeeper.
 */
export function splitAvailability(
  players: AvailPlayer[],
  consentPending: Set<string>,
  confirmed: Set<string>,
  reportedAbsent: Set<string>,
): {
  confirmed: (AvailPlayer & { absent: boolean })[]
  notConfirmed: (AvailPlayer & { absent: boolean })[]
  notEligible: AvailPlayer[]
  goalkeepers: AvailPlayer[]
} {
  const eligible = players.filter(p => !consentPending.has(p.id))
  const flag = (p: AvailPlayer) => ({ ...p, absent: reportedAbsent.has(p.id) })
  const confirmedList = eligible.filter(p => confirmed.has(p.id)).map(flag)
  return {
    confirmed: confirmedList,
    notConfirmed: eligible.filter(p => !confirmed.has(p.id)).map(flag),
    notEligible: players.filter(p => consentPending.has(p.id)),
    goalkeepers: confirmedList.filter(p => p.position === 'Goalkeeper'),
  }
}
