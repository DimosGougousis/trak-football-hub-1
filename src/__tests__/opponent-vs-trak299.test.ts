import { describe, it, expect } from 'vitest'
import { blankForm, eventTitle, formToRow, whatProblem, type EventForm } from '@/lib/coach-events'
import { readFixturesCsv } from '@/lib/fixtures-csv'

/** TRAK-299: a coach who types "vs Marbella FC" as the opponent gets "vs Marbella FC", not "vs vs Marbella FC". */

const match = (opponent: string): EventForm => ({ ...blankForm('2026-11-01'), kind: 'match', opponent, time: '10:00' })

describe('a typed "vs" in front of the opponent', () => {
  it.each(['vs Marbella FC', 'vs. Marbella FC', 'v Marbella FC', 'v. Marbella FC', 'VS  Marbella FC', ' Vs Marbella FC '])(
    '"%s" saves the club name and one "vs" in the title', typed => {
      expect(eventTitle(match(typed))).toBe('vs Marbella FC')
      expect(formToRow(match(typed))).toMatchObject({ opponent: 'Marbella FC', title: 'vs Marbella FC' })
    })

  it('leaves a club whose name starts with V alone', () => {
    expect(formToRow(match('Valencia CF'))).toMatchObject({ opponent: 'Valencia CF', title: 'vs Valencia CF' })
    expect(formToRow(match('Vsetin'))).toMatchObject({ opponent: 'Vsetin' })
  })

  it('still asks for an opponent when only "vs" was typed', () => {
    expect(whatProblem(match('vs'))).not.toBeNull()
    expect(whatProblem(match('vs Marbella FC'))).toBeNull()
  })

  it('a league file reads the same way, so its preview and a second import match the saved fixture', () => {
    const { rows } = readFixturesCsv('Date,Kickoff,Opponent\n2026-11-01,10:00,vs Marbella FC\n')
    expect(rows[0].fixture?.opponent).toBe('Marbella FC')
  })
})
