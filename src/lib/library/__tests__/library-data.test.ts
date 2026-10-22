import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import catalogue from '../catalogue.json'
import {
  LIBRARIES, SESSIONS, ageBandOf, forAge, libraryOrder, playersOf, programmeOf, programmeWeeks, searchLibrary, sessionLine, sizeOf,
  squadsAgeBand, titleParts, weekOf,
} from '../library'
import { BANDS } from '@/lib/types'
import { TRAINING_THEMES } from '@/lib/training-theme'

/**
 * TRAK-264: the coach's Library reads the Coaching Session Catalogue's own data.
 * If the catalogue page changes, run `node scripts/library-data.mjs`.
 */

const html = readFileSync(resolve(__dirname, '../../../../public/trainings/coaching-session-catalogue.html'), 'utf8')
const grab = (name: string) => {
  const line = html.split('\n').find(l => l.startsWith(`const ${name} = `))!
  return JSON.parse(line.slice(`const ${name} = `.length).replace(/;\s*$/, ''))
}
const byTitle = (title: string) => SESSIONS.find(s => s.title === title)!

describe('TRAK-264: the Library\'s sessions are the catalogue\'s', () => {
  it('holds exactly the catalogue page\'s sessions and topics', () => {
    expect(catalogue.sessions).toEqual(grab('DATA'))
    expect(catalogue.topics).toEqual(grab('TOPIC_ORDER'))
    expect(SESSIONS).toHaveLength(196)
  })

  it('has a tile for each of the seven libraries, counting what New event\'s themes count', () => {
    expect(LIBRARIES.map(l => l.label)).toEqual([
      'Technical', 'Defending', 'Attacking', 'Goalkeeping', 'Physical and movement', 'Transition', 'Psychological and social',
    ])
    for (const theme of TRAINING_THEMES) {
      const library = LIBRARIES.find(l => l.key === theme.key)!
      expect(SESSIONS.filter(s => s.library === library.name)).toHaveLength(theme.sessions)
    }
    expect(SESSIONS.every(s => LIBRARIES.some(l => l.name === s.library))).toBe(true)
  })
})

describe('TRAK-264: the tiles take the assessment colours, mostly green', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  it('uses only band colours: five green, one slate, one clay', () => {
    const word = (colour: string) => BANDS.find(b => b.text === colour)?.word
    const words = LIBRARIES.map(l => word(l.colour))
    expect(words.every(Boolean)).toBe(true)
    expect(words.filter(w => ['Exceptional', 'Standout', 'Good'].includes(w!))).toHaveLength(5)
    expect(words.filter(w => w === 'Steady')).toHaveLength(1)
    expect(words.filter(w => w === 'Mixed')).toHaveLength(1)
  })

  it('keeps white writing readable on every tile (4.5:1)', () => {
    for (const library of LIBRARIES) expect((1.05 / (luminance(library.colour) + 0.05)), library.label).toBeGreaterThanOrEqual(4.5)
  })

  it('never puts the same colour side by side, two tiles a row (phone) or four (tablet, laptop)', () => {
    const colours = LIBRARIES.map(l => l.colour)
    for (const columns of [2, 4]) {
      colours.forEach((colour, i) => {
        if ((i + 1) % columns !== 0 && i + 1 < colours.length) expect(colours[i + 1], `${columns} a row, tile ${i + 1}`).not.toBe(colour)
        if (i + columns < colours.length) expect(colours[i + columns], `${columns} a row, under tile ${i + 1}`).not.toBe(colour)
      })
    }
  })
})

describe('TRAK-264: ages', () => {
  it('reads a squad\'s age group as the catalogue\'s', () => {
    expect(ageBandOf('U14')).toBe('12-16')
    expect(ageBandOf('U16')).toBe('12-16')
    expect(ageBandOf('U9')).toBe('5-11')
    expect(ageBandOf('U18')).toBe('17-21')
    expect(ageBandOf('Seniors')).toBeNull()
    expect(squadsAgeBand(['U14', 'U16'])).toBe('12-16')
    expect(squadsAgeBand(['U10', 'U14'])).toBeNull()
    expect(squadsAgeBand([])).toBeNull()
  })

  it('never hides a session that lists no ages: it is for every age', () => {
    const everyAge = SESSIONS.find(s => s.ages.length === 0)!
    expect(forAge(everyAge, '12-16')).toBe(true)
    expect(forAge(byTitle('Session programme: Moving with the ball and turning to attack'), '12-16')).toBe(false)
    expect(SESSIONS.filter(s => forAge(s, '12-16'))).toHaveLength(107)
  })
})

describe('TRAK-264: what a session says about itself', () => {
  it('splits a long name into a small label and a short title', () => {
    expect(titleParts(byTitle('Pressing and covering session: read and react'))).toEqual({ label: 'Pressing and covering session', title: 'Read and react' })
    expect(titleParts(byTitle('Session programme: press and cover to defend'))).toEqual({ label: 'Six-week programme', title: 'Press and cover to defend' })
    expect(titleParts(byTitle('Bib tag'))).toEqual({ label: 'Session', title: 'Bib tag' })
  })

  it('says its week and players in one line', () => {
    expect(sessionLine(byTitle('Pressing and covering session: read and react'))).toBe('Week 1 · 14 players')
    expect(playersOf(byTitle('Pressing and covering session: pressing for glory'))).toBe('11–12 players')
    expect(sizeOf(SESSIONS.find(s => s.format.length === 3)!)).toBe('Any size')
    expect(sizeOf(byTitle('Pressing session: diamond duel'))).toBe('1–4 a side')
  })

  it('lists programmes first, then each programme\'s weeks in order, then sessions on their own', () => {
    const topic = SESSIONS.filter(s => s.library === 'Tactical – Defending' && s.topic === 'Pressing & covering').sort(libraryOrder)
    const kinds = topic.map(s => (s.is_programme ? 'programme' : s.programme ? 'week' : 'alone'))
    expect(kinds).toEqual([...kinds].sort((a, b) => ['programme', 'week', 'alone'].indexOf(a) - ['programme', 'week', 'alone'].indexOf(b)))
    const weeks = topic.filter(s => s.programme === 'press and cover to defend').map(weekOf)
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b))
  })
})

describe('TRAK-264: a programme\'s six weeks', () => {
  it('finds each week\'s session', () => {
    const programme = byTitle('Session programme: press and cover to defend')
    const weeks = programmeWeeks(programme)
    expect(weeks.map(w => [w.week, w.name])).toEqual([
      [1, 'Read and react'], [2, 'Pressing for glory'], [3, 'Cover and recover'],
      [4, 'Pressing duels'], [5, 'Defending in small numbers'], [6, 'Games week'],
    ])
    expect(weeks.map(w => w.session?.title)).toEqual([
      'Pressing and covering session: read and react', 'Pressing and covering session: pressing for glory',
      'Pressing and covering session: cover and recover', 'Pressing and covering session: pressing duels',
      'Pressing and covering session: defending in small numbers', 'Pressing and covering session: games week',
    ])
    expect(programmeOf(weeks[0].session!)).toBe(programme)
  })

  it('leaves a week as text when the catalogue doesn\'t say which session it is', () => {
    // The FA lists these weeks under names no session carries.
    const stopGoals = programmeWeeks(byTitle('Session programme: marking and intercepting to stop goals'))
    expect(stopGoals.every(w => !w.session)).toBe(true)
    // Four programmes end on a "festival week", and two start on "read and react":
    // a session is never claimed by two programmes.
    const claimed = new Map<string, string[]>()
    for (const programme of SESSIONS.filter(s => s.is_programme))
      for (const week of programmeWeeks(programme)) if (week.session) claimed.set(week.session.id, [...(claimed.get(week.session.id) ?? []), programme.title])
    for (const [id, programmes] of claimed) expect(programmes, id).toHaveLength(1)
    expect(claimed.size).toBeGreaterThanOrEqual(45)
  })
})

describe('TRAK-264: search', () => {
  it('finds sessions with every word, named ones first', () => {
    const found = searchLibrary('press cover')
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].title.toLowerCase()).toContain('press')
    expect(found.every(s => JSON.stringify(s).toLowerCase().includes('cover'))).toBe(true)
    expect(searchLibrary('   ')).toEqual([])
    expect(searchLibrary('zzzz')).toEqual([])
  })
})
