import { isRealCalendarDate } from './calendar'

/**
 * League fixtures from a CSV file (J8.6, TRAK-129).
 *
 * The coach drops the league's schedule into Trak, sees every row in a
 * preview, fixes what can't be read, then confirms. This file is the reader:
 * it runs in the browser, writes nothing, and never guesses. A row it cannot
 * read exactly comes back with its problems and no fixture, so the preview can
 * show it and the coach can correct it.
 *
 * PDF is out (Imad, 8 Oct) and AI parsing stays out (G7). A league that only
 * publishes a PDF gets typed into the template below.
 */

export type FixtureField = 'date' | 'kickoff' | 'meetTime' | 'opponent' | 'homeAway' | 'venue' | 'kit'

/** The row as written in the file (trimmed), and what the preview edits. */
export type FixtureValues = Record<FixtureField, string>

export interface Fixture {
  /** CSV line the row came from; the header is line 1. */
  line: number
  /** A row with no opponent is a training (TeamSnap's rule). */
  kind: 'match' | 'training'
  /** YYYY-MM-DD, the day the league wrote. */
  date: string
  /** HH:MM in the academy's own time, or null when not known yet. */
  kickoff: string | null
  meetTime: string | null
  opponent: string | null
  homeAway: 'home' | 'away' | null
  venue: string | null
  kit: string | null
}

export interface FixtureRow {
  line: number
  values: FixtureValues
  /** Null whenever there is any problem: nothing unreadable is ever saved. */
  fixture: Fixture | null
  problems: string[]
}

export interface FixturesRead {
  rows: FixtureRow[]
  /** Slash dates in this file are month-first; edited rows must be read the same way. */
  monthFirstFile: boolean
  /** The file as a whole cannot be used. */
  fileErrors: string[]
  /** The file is usable, but something in it is being left out. */
  warnings: string[]
}

export const MAX_FIXTURE_ROWS = 200
const MAX_TEXT = 120

export const FIXTURE_TEMPLATE_CSV = [
  'Date,Kickoff,Meet time,Opponent,Home or away,Venue,Kit',
  '2026-11-14,10:00,09:15,Rivals FC,Away,Rivals Sports Park,White',
  '2026-11-17,17:30,,,,Main pitch,Training kit',
  '',
].join('\r\n')

const LABELS: Record<FixtureField, string> = {
  date: 'Date',
  kickoff: 'Kick-off',
  meetTime: 'Meet time',
  opponent: 'Opponent',
  homeAway: 'Home or away',
  venue: 'Venue',
  kit: 'Kit',
}

// Header names are compared with case, spaces and punctuation removed, so
// "Kick-off", "KICK OFF" and "kickoff" are one column.
const HEADER_ALIASES: Record<string, FixtureField> = {
  date: 'date',
  kickoff: 'kickoff', time: 'kickoff', start: 'kickoff', starttime: 'kickoff',
  meet: 'meetTime', meettime: 'meetTime', meetingtime: 'meetTime',
  opponent: 'opponent', opposition: 'opponent', against: 'opponent', vs: 'opponent',
  homeoraway: 'homeAway', homeaway: 'homeAway', ha: 'homeAway',
  venue: 'venue', location: 'venue', ground: 'venue', pitch: 'venue',
  kit: 'kit', colours: 'kit', colors: 'kit',
}

const FIELDS = Object.keys(LABELS) as FixtureField[]

/** RFC 4180 fields: quotes, doubled quotes, separators and line ends inside quotes. */
function parseTable(text: string, separator: ',' | ';'): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else {
        if (c === '\n') line++
        field += c
      }
    } else if (c === '"') quoted = true
    else if (c === separator) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push({ cells: row, line: rowLine })
      row = []
      line++
      rowLine = line
    } else field += c
  }
  row.push(field)
  rows.push({ cells: row, line: rowLine })
  return rows
}

/** Excel in comma-decimal locales separates with semicolons. Decided by the header. */
function detectSeparator(text: string): ',' | ';' {
  const header = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => header.split(ch).length - 1
  return count(';') > count(',') ? ';' : ','
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/

/**
 * A file is month-first (American) if any slash date has a second number over
 * 12. Reading such a file day-first would turn 11/03 into 11 March instead of
 * 3 November without any error, so every slash date in it is refused.
 */
function isMonthFirstFile(dates: string[]): boolean {
  return dates.some(d => {
    const m = SLASH_DATE.exec(d)
    return !!m && Number(m[2]) > 12
  })
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function readDate(raw: string, monthFirstFile: boolean): { value: string } | { problem: string } {
  if (!raw) return { problem: 'Date is missing.' }
  let y: number, m: number, d: number
  const iso = ISO_DATE.exec(raw)
  const slash = SLASH_DATE.exec(raw)
  if (iso) {
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3])
  } else if (slash) {
    if (monthFirstFile) {
      return { problem: 'Date: this file writes dates month first (US style), which can be misread. Use YYYY-MM-DD.' }
    }
    d = Number(slash[1]); m = Number(slash[2]); y = Number(slash[3])
  } else {
    return { problem: `Date "${raw}" can't be read. Use YYYY-MM-DD or DD/MM/YYYY.` }
  }
  if (!isRealCalendarDate(y, m, d)) return { problem: `Date "${raw}" is not a real date.` }
  return { value: `${y}-${pad(m)}-${pad(d)}` }
}

const TIME_24 = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/
const TIME_12 = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m\.?$/i

function readTime(raw: string, label: string): { value: string | null } | { problem: string } {
  if (!raw) return { value: null }
  const t24 = TIME_24.exec(raw)
  const t12 = TIME_12.exec(raw)
  let h: number, min: number
  if (t24) {
    h = Number(t24[1]); min = Number(t24[2])
    if (h > 23 || min > 59) return { problem: `${label} "${raw}" is not a real time.` }
  } else if (t12) {
    h = Number(t12[1]); min = Number(t12[2] ?? '0')
    if (h < 1 || h > 12 || min > 59) return { problem: `${label} "${raw}" is not a real time.` }
    h = (h % 12) + (t12[3].toLowerCase() === 'p' ? 12 : 0)
  } else {
    return { problem: `${label} "${raw}" can't be read. Use 24-hour HH:MM, like 18:30.` }
  }
  return { value: `${pad(h)}:${pad(min)}` }
}

function readHomeAway(raw: string): { value: 'home' | 'away' | null } | { problem: string } {
  const v = raw.toLowerCase()
  if (!v) return { value: null }
  if (v === 'home' || v === 'h') return { value: 'home' }
  if (v === 'away' || v === 'a') return { value: 'away' }
  return { problem: `Home or away "${raw}" can't be read. Use Home or Away.` }
}

/**
 * Check one row. Used for every row of the file, and again by the preview
 * after the coach edits a row.
 */
export function validateFixture(values: FixtureValues, line: number, monthFirstFile = false): {
  fixture: Fixture | null
  problems: string[]
} {
  const v = Object.fromEntries(FIELDS.map(f => [f, (values[f] ?? '').trim()])) as FixtureValues
  const problems: string[] = []

  const date = readDate(v.date, monthFirstFile)
  if ('problem' in date) problems.push(date.problem)
  const kickoff = readTime(v.kickoff, 'Kick-off')
  if ('problem' in kickoff) problems.push(kickoff.problem)
  const meet = readTime(v.meetTime, 'Meet time')
  if ('problem' in meet) problems.push(meet.problem)
  const homeAway = readHomeAway(v.homeAway)
  if ('problem' in homeAway) problems.push(homeAway.problem)

  // The schedule refuses a meet time without a start (J8.4's formProblem), so
  // catch it here rather than fail the whole import at save.
  if ('value' in kickoff && 'value' in meet && meet.value && !kickoff.value) {
    problems.push('Add the kick-off: a meet time needs one.')
  }
  if ('value' in kickoff && 'value' in meet && kickoff.value && meet.value && meet.value > kickoff.value) {
    problems.push(`Meet time ${meet.value} is after the kick-off ${kickoff.value}.`)
  }
  // Home or away with no opponent is a match whose opponent was left out.
  // Saving it as a training would lose the match without a word.
  if (!v.opponent && v.homeAway) {
    problems.push('Opponent is missing, but the row says home or away. Add the opponent, or clear home or away for a training.')
  }
  for (const f of ['opponent', 'venue', 'kit'] as const) {
    if (v[f].length > MAX_TEXT) problems.push(`${LABELS[f]} is too long (over ${MAX_TEXT} characters).`)
  }

  if (problems.length > 0 || !('value' in date) || !('value' in kickoff) || !('value' in meet) || !('value' in homeAway)) {
    return { fixture: null, problems }
  }
  return {
    problems,
    fixture: {
      line,
      kind: v.opponent ? 'match' : 'training',
      date: date.value,
      kickoff: kickoff.value,
      meetTime: meet.value,
      opponent: v.opponent || null,
      homeAway: v.opponent ? homeAway.value : null,
      venue: v.venue || null,
      kit: v.kit || null,
    },
  }
}

/**
 * What makes two fixtures the same event: day, kick-off and opponent. Used to
 * stop one file repeating a row, and (with J8.4) to make a second import of
 * the same file add nothing. Venue, kit and meet time are details of the same
 * fixture, not a different one.
 */
export function fixtureKey(f: Pick<Fixture, 'date' | 'kickoff' | 'opponent'>): string {
  const opponent = (f.opponent ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return `${f.date}|${f.kickoff ?? ''}|${opponent}`
}

export function readFixturesCsv(text: string): FixturesRead {
  const clean = (text ?? '').replace(/^\uFEFF/, '')
  const table = parseTable(clean, detectSeparator(clean))
    .filter(r => r.cells.some(c => c.trim() !== ''))
  if (table.length === 0) return { rows: [], monthFirstFile: false, fileErrors: ['The file is empty.'], warnings: [] }

  const [header, ...body] = table
  const columns: (FixtureField | null)[] = []
  const fileErrors: string[] = []
  const warnings: string[] = []
  const seen = new Map<FixtureField, string>()
  for (const name of header.cells) {
    const field = HEADER_ALIASES[name.toLowerCase().replace(/[^a-z]/g, '')] ?? null
    columns.push(field)
    if (field === null) {
      if (name.trim()) warnings.push(`Column "${name.trim()}" isn't used and will be ignored.`)
    } else if (seen.has(field)) {
      fileErrors.push(`"${seen.get(field)}" and "${name.trim()}" both look like the ${LABELS[field]} column. Keep one.`)
    } else {
      seen.set(field, name.trim())
    }
  }
  if (!seen.has('date')) fileErrors.push('The file has no Date column. Start from the template.')
  if (body.length === 0) fileErrors.push('The file has no fixtures under its header row.')
  if (body.length > MAX_FIXTURE_ROWS) {
    fileErrors.push(`The file has ${body.length} rows; the limit is ${MAX_FIXTURE_ROWS}. Split it into smaller files.`)
  }
  if (fileErrors.length > 0) return { rows: [], monthFirstFile: false, fileErrors, warnings }

  const valuesOf = (cells: string[]): FixtureValues => {
    const values = Object.fromEntries(FIELDS.map(f => [f, ''])) as FixtureValues
    columns.forEach((field, i) => {
      if (field) values[field] = (cells[i] ?? '').trim()
    })
    return values
  }

  const rows = body.map(r => ({ line: r.line, values: valuesOf(r.cells) }))
  const monthFirstFile = isMonthFirstFile(rows.map(r => r.values.date))
  return { rows: checkRows(rows, monthFirstFile), monthFirstFile, fileErrors: [], warnings }
}

/**
 * Check every row, and flag a row that repeats an earlier one. The preview
 * calls this again after each edit or removal, so a fixed duplicate clears and
 * a duplicate made by an edit shows.
 */
export function checkRows(rows: { line: number; values: FixtureValues }[], monthFirstFile: boolean): FixtureRow[] {
  const firstLineByKey = new Map<string, number>()
  return rows.map(({ line, values }): FixtureRow => {
    const { fixture, problems } = validateFixture(values, line, monthFirstFile)
    if (fixture) {
      const key = fixtureKey(fixture)
      const earlier = firstLineByKey.get(key)
      if (earlier !== undefined) {
        return { line, values, fixture: null, problems: [`Same fixture as line ${earlier}.`] }
      }
      firstLineByKey.set(key, line)
    }
    return { line, values, fixture, problems }
  })
}
