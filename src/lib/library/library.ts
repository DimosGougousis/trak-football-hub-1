import catalogue from './catalogue.json'
import { BANDS, type BandConfig } from '@/lib/types'
import { TRAINING_THEMES, type TrainingTheme } from '@/lib/training-theme'

/* TRAK-264 (Kostas, 22 Oct): the coach's Library. Its sessions are the
   Coaching Session Catalogue's (England Football Learning, 196 sessions),
   copied from public/trainings/coaching-session-catalogue.html by
   scripts/library-data.mjs; library-data.test.ts keeps the copy identical. */

export interface LibrarySession {
  id: string
  title: string
  /** The catalogue's library name, e.g. "Tactical – Defending". */
  library: string
  topic: string
  /** A six-week programme: its `practices` are its weeks. */
  is_programme: boolean
  /** For a programme's week: the programme's name as the FA wrote it, and the week as a word. */
  programme: string
  programme_week: string
  summary: string
  ages: string[]
  skills: string[]
  format: string[]
  setup: string[]
  objectives: string[]
  practices: string[]
  drill_steps: number
  video: string
  pdf: string
  published: string
  url: string
}

export const SESSIONS = catalogue.sessions as LibrarySession[]
/** Each library's topics, in the catalogue's order. */
export const TOPICS = catalogue.topics as Record<string, string[]>

/** Kostas, 22 Oct: the tiles take the assessment colours (TRAK-229), mostly green with
 *  one slate and one clay. Each library borrows a band's readable shade and its tint. */
const LIBRARY_BANDS: [TrainingTheme, string, BandConfig['word']][] = [
  ['technical', 'Technical', 'Exceptional'],
  ['defending', 'Defending', 'Steady'],
  ['attacking', 'Attacking', 'Standout'],
  ['goalkeeping', 'Goalkeeping', 'Exceptional'],
  ['physical', 'Physical and movement', 'Mixed'],
  ['transition', 'Transition', 'Standout'],
  ['psychological', 'Psychological and social', 'Exceptional'],
]

export interface Library {
  key: TrainingTheme
  label: string
  /** The catalogue's name for it. */
  name: string
  /** The tile and header colour; white text reads on it. */
  colour: string
  /** A pale wash of the colour, behind a session's picture. */
  tint: string
}

/** The libraries in the Library's tile order. A library's key is a training's theme key. */
export const LIBRARIES: Library[] = LIBRARY_BANDS.map(([key, label, word]) => {
  const band = BANDS.find(b => b.word === word)!
  return { key, label, name: TRAINING_THEMES.find(t => t.key === key)!.library, colour: band.text, tint: band.bg }
})

/** The Library's address: the coach frame's Library tab (TRAK-259). */
export const LIBRARY_PATH = '/coach/trainings'
export const libraryPath = (key: string) => `${LIBRARY_PATH}/${key}`
export const sessionPath = (s: LibrarySession) => `${LIBRARY_PATH}/${s.is_programme ? 'programme' : 'session'}/${s.id}`

export const libraryByKey = (key: string | undefined) => LIBRARIES.find(l => l.key === key)
export const libraryOf = (session: LibrarySession) => LIBRARIES.find(l => l.name === session.library)!
export const sessionById = (id: string | undefined) => SESSIONS.find(s => s.id === id)

// ---------- Ages and sizes ----------

/** The catalogue's age groups, youngest first. */
export const AGE_BANDS = ['Play phase 4-6', '5-11', '12-16', '17-21', '21+'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

export const ageLabel = (band: string) => band === 'Play phase 4-6' ? 'Ages 4–6' : `Ages ${band.replace('-', '–')}`
export const formatLabel = (format: string) => `${format.replace(' Per Side', '').replace('-', '–')} a side`

/** A squad's age group ("U14") as the catalogue's age group, or null when it can't tell. */
export function ageBandOf(squad: string): AgeBand | null {
  const age = Number(/U\s*(\d+)/i.exec(squad)?.[1])
  if (!age) return null
  return age <= 6 ? 'Play phase 4-6' : age <= 11 ? '5-11' : age <= 16 ? '12-16' : age <= 21 ? '17-21' : '21+'
}

/** The one age group all the coach's squads are in (U14 and U16 are both 12–16), or null. */
export function squadsAgeBand(squads: string[]): AgeBand | null {
  const bands = new Set(squads.map(ageBandOf))
  return bands.size === 1 ? [...bands][0] : null
}

/** A session with no ages listed is for every age, so an age filter never hides it. */
export const forAge = (session: LibrarySession, band: string | null) =>
  !band || session.ages.length === 0 || session.ages.includes(band)

// ---------- What a session says about itself ----------

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "Pressing and covering session: read and react" → a small label and a short title. */
export function titleParts(session: LibrarySession): { label: string; title: string } {
  if (session.is_programme) return { label: 'Six-week programme', title: capital(session.title.replace(/^Session programme:\s*/i, '')) }
  const colon = session.title.indexOf(':')
  return colon < 0 ? { label: 'Session', title: session.title }
    : { label: session.title.slice(0, colon).trim(), title: capital(session.title.slice(colon + 1).trim()) }
}

/** A kit item as shown: "44×30-yard pitch", "11–12 players", with proper signs. */
export const kitItem = (item: string) =>
  item.replace(/(\d)x(\d)/g, '$1×$2').replace(/(\d)-(\d)/g, '$1–$2').replace('Spots/flat markers', 'Spots or flat markers')
const fromSetup = (session: LibrarySession, pattern: RegExp) => {
  const item = session.setup.find(entry => pattern.test(entry))
  return item && kitItem(item)
}
/** "14 players", from the session's kit list. */
export const playersOf = (session: LibrarySession) => fromSetup(session, /\bplayers?\b/i)
/** "44×30-yard pitch". */
export const pitchOf = (session: LibrarySession) => fromSetup(session, /pitch/i)
/** "5–8 a side", or "Any size" when a session suits every size. */
export const sizeOf = (session: LibrarySession) =>
  session.format.length >= 3 ? 'Any size' : session.format.map(formatLabel).join(', ')

const WEEK: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
export const weekOf = (session: LibrarySession) => WEEK[session.programme_week] ?? 0

/** "Ages 12–16 · 14 players · 44×30-yard pitch · 5 steps": what a coach checks before picking a session. */
export function factsLine(session: LibrarySession) {
  return [
    session.ages.length ? session.ages.map(ageLabel).join(', ') : 'Every age',
    playersOf(session) ?? sizeOf(session),
    pitchOf(session),
    session.drill_steps ? `${session.drill_steps} steps` : '',
  ].filter(Boolean).join(' · ')
}

// ---------- Programmes and their weeks ----------

const norm = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const words = (text: string) => new Set(norm(text).split(' ').filter(w => w.length > 2 && !['and', 'the', 'session', 'programme'].includes(w)))
const afterColon = (title: string) => (title.includes(':') ? title.slice(title.indexOf(':') + 1) : title)

export interface ProgrammeWeek { week: number; name: string; session?: LibrarySession }

/** A programme's six weeks, each with its session when the catalogue makes that clear.
 *  The FA's data names a week's programme loosely ("passing and receiving" is two
 *  programmes), so a week that matches no session, or two equally well, stays text. */
export function programmeWeeks(programme: LibrarySession): ProgrammeWeek[] {
  const own = words(programme.title)
  return programme.practices.map(line => {
    const parsed = /^Week (\w+)\s*[:–-]\s*(.+)$/i.exec(line)
    if (!parsed) return { week: 0, name: line }
    const week = WEEK[parsed[1].toLowerCase()] ?? 0
    const name = parsed[2].trim()
    const candidates = SESSIONS.filter(s => !s.is_programme && weekOf(s) === week && norm(afterColon(s.title)) === norm(name))
    const score = (s: LibrarySession) => [...words(s.programme)].filter(w => own.has(w)).length
      + (s.library === programme.library ? 0.5 : 0) + (s.ages.some(a => programme.ages.includes(a)) ? 0.25 : 0)
    const ranked = candidates.map(s => ({ s, score: score(s) })).sort((a, b) => b.score - a.score)
    const sure = ranked.length === 1 || (ranked.length > 1 && ranked[0].score > ranked[1].score)
    return { week, name: capital(name), session: sure ? ranked[0].s : undefined }
  })
}

let byWeek: Map<string, LibrarySession> | null = null
/** The programme a week's session belongs to, when the catalogue makes that clear. */
export function programmeOf(session: LibrarySession): LibrarySession | undefined {
  if (!byWeek) {
    byWeek = new Map()
    for (const programme of SESSIONS.filter(s => s.is_programme))
      for (const week of programmeWeeks(programme)) if (week.session) byWeek.set(week.session.id, programme)
  }
  return byWeek.get(session.id)
}

/** Programmes first, then each programme's weeks in turn, then sessions on their own, by name. */
export function libraryOrder(a: LibrarySession, b: LibrarySession) {
  return Number(b.is_programme) - Number(a.is_programme)
    || Number(!a.programme) - Number(!b.programme)
    || a.programme.localeCompare(b.programme)
    || weekOf(a) - weekOf(b)
    || a.title.localeCompare(b.title)
}

/** One supporting line under a session's name: its week, then its players or size. */
export function sessionLine(session: LibrarySession): string {
  const parts = [
    weekOf(session) ? `Week ${weekOf(session)}` : '',
    playersOf(session) ?? sizeOf(session),
    session.ages.length === 0 ? 'every age' : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

// ---------- Search ----------

/** The catalogue's own search: every word must appear somewhere in the session.
 *  Sessions named after the words come first. */
export function searchLibrary(query: string): LibrarySession[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const hay = (s: LibrarySession) => [s.title, s.summary, s.topic, s.library, ...s.skills, ...s.objectives, ...s.practices, ...s.setup, s.programme].join(' ').toLowerCase()
  const named = (s: LibrarySession) => terms.every(t => s.title.toLowerCase().includes(t))
  return SESSIONS.filter(s => terms.every(t => hay(s).includes(t)))
    .sort((a, b) => Number(named(b)) - Number(named(a)) || Number(b.is_programme) - Number(a.is_programme) || libraryOrder(a, b))
}
