/* TRAK-285 (Games 3/8): the formats and the shapes a coach picks from (Imad, 28 Oct), one list per format, for our
   formation and for theirs. A shape's numbers are its lines from the back; the keeper comes on top. */

export const FORMATS = [11, 9, 7, 5] as const
export type Format = (typeof FORMATS)[number]

export const FORMATIONS: Record<Format, string[]> = {
  11: ['4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '4-4-1-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1'],
  9: ['3-3-2', '3-2-3', '2-4-2', '3-4-1'],
  7: ['2-3-1', '3-2-1', '2-1-2-1', '3-1-2'],
  5: ['2-2', '1-2-1', '3-1'],
}
export const DEFAULT_FORMATION: Record<Format, string> = { 11: '4-4-2', 9: '3-3-2', 7: '2-3-1', 5: '2-2' }

export type Slot = { slot: number; x: number; y: number }

/** Where each slot sits, in % of the pitch: x across, y from our goal (0) to theirs (100). Slot 1 is the keeper, then
 *  each line from the back, left to right: the numbering game_plan_players.slot keeps. */
export function slotsOf(shape: string): Slot[] {
  const lines = shape.split('-').map(Number)
  const slots: Slot[] = [{ slot: 1, x: 50, y: 8 }]
  lines.forEach((count, line) => {
    const y = 28 + (line * 60) / Math.max(1, lines.length - 1)
    for (let i = 0; i < count; i++) slots.push({ slot: slots.length + 1, x: (100 * (i + 1)) / (count + 1), y })
  })
  return slots
}

/** A slot's plain name: the keeper, the back line, the front line, and the lines between. */
export function lineName(shape: string, slot: number): string {
  if (slot === 1) return 'Goalkeeper'
  const lines = shape.split('-').map(Number)
  let last = 1
  for (const [line, count] of lines.entries()) {
    last += count
    if (slot <= last) return line === 0 ? 'Defender' : line === lines.length - 1 ? 'Forward' : 'Midfielder'
  }
  return 'Player'
}
