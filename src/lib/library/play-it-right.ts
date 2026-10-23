import content from './play-it-right.json'
import { BANDS, type BandConfig } from '@/lib/types'
import { LIBRARY_PATH } from './library'

/* TRAK-268 (Kostas, 23 Oct): Play It Right in Trak's look. Its content is the old
   page's own (public/trainings/play-it-right.html), copied by
   scripts/play-it-right-data.mjs; play-it-right-data.test.ts keeps the copy identical.
   180 match moments for ages 13–16, 30 for each of the code's six parts, and a story
   with three quick calls per part for ages 17–20. Nothing a coach taps is saved. */

/** One frame of a moment's strip: a caption, or someone saying or thinking something. */
export type Panel = { cap: string } | { who: string; say: string } | { who: string; think: string }
export interface Why { you: string; club: string; game: string }
export interface FollowUp { q: string; opts: string[]; fb: string[] }

export interface Moment {
  id: string
  /** The part of the code it belongs to (a Part's id). */
  sec: string
  /** Week 1–18 of the old weekly plan: each week is on one part. */
  wk: number
  title: string
  /** "mcq": make the call (the first option is the best). "rank": rank three (the options are in the best order). */
  type: 'mcq' | 'rank'
  panels: Panel[]
  q: string
  opts: string[]
  /** Feedback for each option, in the options' order. */
  fb: string[]
  /** What the coach saw. */
  coach: string
  why: Why
  tip: string
  next?: FollowUp
}

interface SeniorStory { title: string; scene: string; steps: string[]; why: Why; tip: string; qs: FollowUp[] }

const CODE = content.code as { id: string; n: number; name: string; line: string }[]
export const MOMENTS = content.moments as Moment[]
const SENIOR = content.senior as { stepsLabel: string[]; tipLabel: string; pillars: Record<string, SeniorStory> }

/** Kostas's tiles: the assessment colours, mostly green (four green, one slate, one clay), in an
 *  order where no colour sits beside itself two or three tiles a row. */
const PART_BANDS: Record<string, BandConfig['word']> = {
  commit: 'Exceptional', attitude: 'Standout', sport: 'Steady', train: 'Mixed', match: 'Exceptional', off: 'Standout',
}

export interface Part {
  id: string
  n: number
  /** "Behaviour and attitude": the code's name in plain words. */
  name: string
  /** What the code asks, in the code's words. */
  line: string
  colour: string
  tint: string
}

export const PARTS: Part[] = CODE.map(c => {
  const band = BANDS.find(b => b.word === PART_BANDS[c.id])!
  return { id: c.id, n: c.n, name: c.name.replace(' & ', ' and ').replace(/ (\w)/g, (_, l: string) => ` ${l.toLowerCase()}`), line: c.line, colour: band.text, tint: band.bg }
})

export const partById = (id: string | undefined) => PARTS.find(p => p.id === id)
export const momentById = (id: string | undefined) => MOMENTS.find(m => m.id === id)
/** A part's moments in the order the weeks bring them. */
export const momentsOf = (part: Part) => MOMENTS.filter(m => m.sec === part.id).sort((a, b) => a.wk - b.wk)

export const kindOf = (moment: Moment) => (moment.type === 'rank' ? 'Rank three' : 'Make the call')

/** The two age groups. Ages 13–16 are the academy's match moments; 17–20 are the senior stories. */
export type Ages = '13-16' | '17-20'
export const agesFrom = (value: string | null): Ages => (value === '17-20' ? '17-20' : '13-16')

export interface SeniorPart extends SeniorStory {
  /** "Dilemma", "Leader's move", "Outcome": the names of the story's three steps. */
  stepLabels: string[]
  tipLabel: string
}
export const seniorOf = (part: Part): SeniorPart => ({ ...SENIOR.pillars[part.id], stepLabels: SENIOR.stepsLabel, tipLabel: SENIOR.tipLabel })

/** The order the options are shown in: the old page's own shuffle (the same every time for the same
 *  moment), so the best call isn't always first. */
export function shownOrder(key: string, n: number): number[] {
  let h = 2166136261
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  h >>>= 0
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}

/** A speaker's round badge: their initials, in one of the band colours (the same one every time). */
export function speaker(name: string) {
  const colours = BANDS.map(b => b.text)
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0
  return { initials: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?', colour: colours[Math.abs(h) % colours.length] }
}

export const PIR_PATH = `${LIBRARY_PATH}/play-it-right`
export const partPath = (part: Part, ages: Ages = '13-16') => `${PIR_PATH}/${part.id}${ages === '17-20' ? '?ages=17-20' : ''}`
export const momentPath = (moment: Moment) => `${PIR_PATH}/moment/${moment.id}`
