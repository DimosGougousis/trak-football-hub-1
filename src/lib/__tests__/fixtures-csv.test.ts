import { describe, expect, it } from 'vitest'
import {
  FIXTURE_TEMPLATE_CSV,
  checkRows,
  fixtureKey,
  readFixturesCsv,
  validateFixture,
} from '../fixtures-csv'

const HEADER = 'Date,Kickoff,Meet time,Opponent,Home or away,Venue,Kit'

function read(...lines: string[]) {
  return readFixturesCsv([HEADER, ...lines].join('\n'))
}

describe('readFixturesCsv: a league file becomes fixtures', () => {
  it('reads twelve fixtures exactly as written, one per row', () => {
    const lines = Array.from({ length: 12 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      return `2026-11-${day},18:00,17:15,Opponent ${i + 1},${i % 2 ? 'Away' : 'Home'},Pitch ${i + 1},Blue`
    })
    const { rows, fileErrors } = read(...lines)

    expect(fileErrors).toEqual([])
    expect(rows).toHaveLength(12)
    expect(rows.every(r => r.problems.length === 0)).toBe(true)
    expect(rows[1].fixture).toEqual({
      line: 3,
      kind: 'match',
      date: '2026-11-02',
      kickoff: '18:00',
      meetTime: '17:15',
      opponent: 'Opponent 2',
      homeAway: 'away',
      venue: 'Pitch 2',
      kit: 'Blue',
    })
  })

  it('treats a row with no opponent as a training (the TeamSnap rule)', () => {
    const { rows } = read('2026-11-03,17:00,,,,Main pitch,Training kit')
    expect(rows[0].problems).toEqual([])
    expect(rows[0].fixture).toMatchObject({ kind: 'training', opponent: null, homeAway: null })
  })

  it('keeps commas and quotes inside quoted fields', () => {
    const { rows } = read('2026-11-04,18:00,,"Al Wasl, U15","home","Zabeel Park, Pitch ""B""",White')
    expect(rows[0].problems).toEqual([])
    expect(rows[0].fixture).toMatchObject({ opponent: 'Al Wasl, U15', venue: 'Zabeel Park, Pitch "B"' })
  })

  it('reads an Excel export: byte-order mark, CRLF line ends, day-first dates and seconds on times', () => {
    const text = '\uFEFFDate,Kick-off,Meet,Opponent,H/A,Venue,Kit\r\n13/11/2026,18:00:00,17:30:00,Rivals FC,A,Away ground,Red\r\n'
    const { rows, fileErrors } = readFixturesCsv(text)
    expect(fileErrors).toEqual([])
    expect(rows[0].problems).toEqual([])
    expect(rows[0].fixture).toMatchObject({ date: '2026-11-13', kickoff: '18:00', meetTime: '17:30', homeAway: 'away' })
  })

  it('reads a semicolon-separated export (Excel in a comma-decimal locale)', () => {
    const { rows, fileErrors } = readFixturesCsv('Date;Kickoff;Opponent\n2026-11-05;19:30;Rivals FC\n')
    expect(fileErrors).toEqual([])
    expect(rows[0].fixture).toMatchObject({ date: '2026-11-05', kickoff: '19:30', opponent: 'Rivals FC' })
  })

  it('reads 12-hour times', () => {
    const { rows } = read('2026-11-06,6:30 PM,5pm,Rivals FC,,,')
    expect(rows[0].problems).toEqual([])
    expect(rows[0].fixture).toMatchObject({ kickoff: '18:30', meetTime: '17:00' })
  })

  it('allows a fixture whose kick-off is not known yet', () => {
    const { rows } = read('2026-11-07,,,Rivals FC,home,,')
    expect(rows[0].problems).toEqual([])
    expect(rows[0].fixture).toMatchObject({ kickoff: null, meetTime: null })
  })

  it('skips blank lines without counting them as fixtures', () => {
    const { rows } = read('', '2026-11-08,18:00,,Rivals FC,,,', ',,,,,,', '')
    expect(rows).toHaveLength(1)
    expect(rows[0].line).toBe(3)
  })
})

describe('readFixturesCsv: bad rows are caught in the preview, never saved', () => {
  it.each([
    ['an impossible day', '2026-02-31,18:00,,Rivals FC,,,'],
    ['a month that does not exist', '2026-13-01,18:00,,Rivals FC,,,'],
    ['text in the date', 'next Tuesday,18:00,,Rivals FC,,,'],
    ['a missing date', ',18:00,,Rivals FC,,,'],
    ['a two-digit year', '13/11/26,18:00,,Rivals FC,,,'],
  ])('rejects %s', (_label, line) => {
    const { rows } = read(line)
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/date/i)
  })

  it.each([
    ['25:00'], ['18:60'], ['six'], ['18'], ['13:00 PM'],
  ])('rejects the kick-off %s', (kickoff) => {
    const { rows } = read(`2026-11-09,${kickoff},,Rivals FC,,,`)
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/kick-off/i)
  })

  it('rejects a bad meet time', () => {
    const { rows } = read('2026-11-09,18:00,99:00,Rivals FC,,,')
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/meet time/i)
  })

  it('rejects a meet time after the kick-off', () => {
    const { rows } = read('2026-11-09,18:00,18:30,Rivals FC,,,')
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/meet time .*after/i)
  })

  it('rejects a meet time with no kick-off, which the schedule cannot save', () => {
    const { rows } = read('2026-11-09,,17:15,Rivals FC,,,')
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/kick-off.*meet time/i)
  })

  it('rejects home or away values it cannot read', () => {
    const { rows } = read('2026-11-09,18:00,,Rivals FC,maybe,,')
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/home or away/i)
  })

  it('refuses home or away without an opponent, rather than silently saving a training', () => {
    const { rows } = read('2026-11-09,18:00,,,Away,,')
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/opponent/i)
  })

  it('flags slash dates when the file is month-first, because 03/04 would be read the wrong way round', () => {
    const { rows } = read('11/13/2026,18:00,,Rivals FC,,,', '11/03/2026,18:00,,Other FC,,,')
    expect(rows.every(r => r.fixture === null)).toBe(true)
    expect(rows[1].problems.join(' ')).toMatch(/month first/i)
  })

  it('flags a row that repeats an earlier row, so one file cannot create the same match twice', () => {
    const { rows } = read('2026-11-10,18:00,,Rivals FC,home,,', '2026-11-10,18:00,,rivals fc ,Home,,')
    expect(rows[0].problems).toEqual([])
    expect(rows[1].fixture).toBeNull()
    expect(rows[1].problems.join(' ')).toMatch(/line 2/)
  })

  it('reports an over-long field instead of truncating it', () => {
    const { rows } = read(`2026-11-10,18:00,,${'x'.repeat(121)},,,`)
    expect(rows[0].fixture).toBeNull()
    expect(rows[0].problems.join(' ')).toMatch(/opponent .*too long/i)
  })

  it('names the CSV line of each bad row (the header is line 1)', () => {
    const { rows } = read('2026-11-10,18:00,,Rivals FC,,,', '2026-02-30,18:00,,Other FC,,,')
    expect(rows[1].line).toBe(3)
  })
})

describe('readFixturesCsv: problems with the whole file', () => {
  it('refuses a file with no date column', () => {
    const { rows, fileErrors } = readFixturesCsv('Kickoff,Opponent\n18:00,Rivals FC\n')
    expect(rows).toEqual([])
    expect(fileErrors.join(' ')).toMatch(/date/i)
  })

  it('refuses an empty file and a header with no fixtures', () => {
    expect(readFixturesCsv('').fileErrors).not.toEqual([])
    expect(readFixturesCsv(`${HEADER}\n`).fileErrors.join(' ')).toMatch(/no fixtures/i)
  })

  it('names columns it ignores instead of dropping them silently', () => {
    const { fileErrors, warnings } = readFixturesCsv('Date,Opponent,Referee\n2026-11-11,Rivals FC,Mr Smith\n')
    expect(fileErrors).toEqual([])
    expect(warnings.join(' ')).toMatch(/Referee/)
  })

  it('refuses a file that names the same column twice', () => {
    const { fileErrors } = readFixturesCsv('Date,Opponent,Opposition\n2026-11-11,A,B\n')
    expect(fileErrors.join(' ')).toMatch(/opponent/i)
  })

  it('refuses more than 200 rows', () => {
    const lines = Array.from({ length: 201 }, () => '2026-11-12,18:00,,,,,')
    expect(read(...lines).fileErrors.join(' ')).toMatch(/200/)
  })
})

describe('validateFixture: the preview re-checks a row after the coach edits it', () => {
  it('turns a corrected row into a fixture', () => {
    const { rows } = read('2026-02-31,18:00,,Rivals FC,,,')
    expect(rows[0].fixture).toBeNull()

    const edited = validateFixture({ ...rows[0].values, date: '2026-02-28' }, rows[0].line)
    expect(edited.problems).toEqual([])
    expect(edited.fixture).toMatchObject({ date: '2026-02-28', opponent: 'Rivals FC', line: 2 })
  })
})

describe('fixtureKey: re-importing the same file adds nothing', () => {
  it('is the same for the same fixture whatever the spacing or case', () => {
    const a = read('2026-11-10,18:00,,Rivals FC,home,,').rows[0].fixture!
    const b = read('10/11/2026,6:00 pm,17:00,  RIVALS FC ,H,Other pitch,Red').rows[0].fixture!
    expect(fixtureKey(a)).toBe(fixtureKey(b))
  })

  it('differs when the date, the kick-off or the opponent differs', () => {
    const base = read('2026-11-10,18:00,,Rivals FC,,,').rows[0].fixture!
    const others = [
      '2026-11-11,18:00,,Rivals FC,,,',
      '2026-11-10,19:00,,Rivals FC,,,',
      '2026-11-10,18:00,,Other FC,,,',
      '2026-11-10,18:00,,,,,',
    ].map(l => fixtureKey(read(l).rows[0].fixture!))
    expect(others).not.toContain(fixtureKey(base))
  })
})

describe('the downloadable template', () => {
  it('reads back cleanly: one match and one training, no problems', () => {
    const { rows, fileErrors, warnings } = readFixturesCsv(FIXTURE_TEMPLATE_CSV)
    expect(fileErrors).toEqual([])
    expect(warnings).toEqual([])
    expect(rows.map(r => r.fixture?.kind)).toEqual(['match', 'training'])
  })
})

describe('checkRows: the preview re-checks every row after an edit or a removal', () => {
  it('reports the file as month-first so edited rows are read the same way', () => {
    expect(read('11/13/2026,18:00,,Rivals FC,,,').monthFirstFile).toBe(true)
    expect(read('13/11/2026,18:00,,Rivals FC,,,').monthFirstFile).toBe(false)
  })

  it('clears "Same fixture" once the coach edits one of the two rows', () => {
    const { rows, monthFirstFile } = read('2026-11-10,18:00,,Rivals FC,,,', '2026-11-10,18:00,,Rivals FC,,,')
    expect(rows[1].problems).toEqual(['Same fixture as line 2.'])
    const edited = rows.map(r => r.line === 3 ? { line: r.line, values: { ...r.values, kickoff: '19:00' } } : r)
    const checked = checkRows(edited, monthFirstFile)
    expect(checked.every(r => r.problems.length === 0 && r.fixture)).toBe(true)
  })

  it('clears "Same fixture" once the earlier row is removed', () => {
    const { rows, monthFirstFile } = read('2026-11-10,18:00,,Rivals FC,,,', '2026-11-10,18:00,,Rivals FC,,,')
    const checked = checkRows(rows.slice(1), monthFirstFile)
    expect(checked[0].problems).toEqual([])
    expect(checked[0].fixture?.line).toBe(3)
  })

  it('flags a duplicate created by an edit', () => {
    const { rows, monthFirstFile } = read('2026-11-10,18:00,,Rivals FC,,,', '2026-11-11,18:00,,Rivals FC,,,')
    const edited = rows.map(r => r.line === 3 ? { line: r.line, values: { ...r.values, date: '2026-11-10' } } : r)
    expect(checkRows(edited, monthFirstFile)[1].problems).toEqual(['Same fixture as line 2.'])
  })

  it('keeps refusing slash dates in a month-first file after an edit', () => {
    const { rows, monthFirstFile } = read('11/13/2026,18:00,,Rivals FC,,,')
    const edited = [{ line: rows[0].line, values: { ...rows[0].values, date: '11/12/2026' } }]
    expect(checkRows(edited, monthFirstFile)[0].fixture).toBeNull()
    const fixed = [{ line: rows[0].line, values: { ...rows[0].values, date: '2026-11-12' } }]
    expect(checkRows(fixed, monthFirstFile)[0].fixture?.date).toBe('2026-11-12')
  })
})
