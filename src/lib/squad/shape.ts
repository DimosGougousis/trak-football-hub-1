import type { BandType } from '@/lib/types'
import { ATTRIBUTES, type AttributeKey } from './attributes'
import { bandMoves, type AssessmentRow } from './snapshot'

export type Scores = Record<AttributeKey, number>

const round1 = (n: number) => Math.round(n * 10) / 10

/** The month before a YYYY-MM month. */
const previousMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * TRAK-262 (Imad, 22 Oct): Home's Squad shape. The squad's average per attribute (out of 10) over every assessment
 * this calendar month and last, null for a month with none; and how many players sit in each band, by their latest
 * rated assessment. `dateOf` turns a timestamp into the academy's calendar date (YYYY-MM-DD).
 */
export function squadShape(rows: AssessmentRow[], todayISO: string, dateOf: (iso: string) => string): {
  thisMonth: Scores | null
  lastMonth: Scores | null
  bands: Partial<Record<BandType, number>>
} {
  const dated = rows.filter(row => row.created_at).map(row => ({ row, month: dateOf(row.created_at).slice(0, 7) }))
  const average = (month: string): Scores | null => {
    const inMonth = dated.filter(entry => entry.month === month).map(entry => entry.row)
    if (inMonth.length === 0) return null
    return Object.fromEntries(ATTRIBUTES.map(([key]) =>
      [key, round1(inMonth.reduce((sum, row) => sum + row[key], 0) / inMonth.length)])) as Scores
  }
  const bands: Partial<Record<BandType, number>> = {}
  for (const { band } of bandMoves(rows).values()) bands[band] = (bands[band] ?? 0) + 1
  const month = todayISO.slice(0, 7)
  return { thisMonth: average(month), lastMonth: average(previousMonth(month)), bands }
}
