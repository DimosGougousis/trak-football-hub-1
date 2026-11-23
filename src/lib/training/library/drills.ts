import type { DrillTypeName, Kind } from './kinds'
import TEXT from '@/locales/en/drills.json'

/* TRAK-385 (Drill Library 1/11, parent TRAK-384): the Library's drills. For now these are the 8 Nov mockup's 44 sample
   drills, written by Claude and not yet checked by Steve. TRAK-388 (Drill Library 10/11): the real library, from the
   pick list Kostas marked on 9 Nov. Trak's built-in shelf (../shelf.ts) and the useful FA sessions were pooled, merged
   and rewritten in our own words: the samples stay (two retired), 15 are new, Cool-down joins Get ready. Steve checks
   the wording after the pilot (Kostas, 9 Nov), so the pages don't say it's unchecked. Kostas, 6 Nov:
   a coach can never change a Trak drill, only bookmark it, so each one lives here, not in the database.

   Every id starts with `lib-`, so a saved plan's `trak_drill` from the old shelf (`w1`, `p1`, `r1`… in ../shelf.ts)
   never finds a Library drill. An id never changes once a plan can name it, even if the drill is renamed. */

/** How Trak sets a drill out for any number of players. One per drill; ./fit.ts holds the numbers. */
export type Template =
  | 'warm'    // everyone in one box, no ball
  | 'free'    // pairs moving anywhere, a ball each
  | 'pairs'   // partners facing each other
  | 'groups'  // groups of about five on the cones of a square
  | 'square'  // keep the ball in a square: attackers v defenders, in one or two grids
  | 'func'    // attackers v defenders at one goal, in turns
  | 'funcm'   // even teams at one goal with a keeper, in their positions
  | 'game'    // two teams towards targets
  | 'shoot'   // shots at goal, or serves to a keeper

/** Who the drill is for: the team, one player (also good with a private coach), or the keepers. */
export type Focus = 'team' | 'individual' | 'goalkeeping'

export type LibraryDrill = {
  id: string
  name: string
  kind: Kind
  /** Its drill type within the kind, from ./kinds.ts. */
  type: DrillTypeName
  focus: Focus
  template: Template
  /** The drill's own rule, the same at every level, or one per level (8, easiest first). */
  rule?: string | readonly string[]
  /** What the players aim for, when it isn't the template's usual one. */
  targets?: string
  /** For the pitch picture (TRAK-386): marks drawn on top of the template. */
  overlay?: 'quarters' | 'wide' | 'split' | 'endzones' | 'gates' | 'middle' | 'gate' | 'target'
  /** groups: the inside players shadow the passers rather than receive. */
  shadow?: boolean
  /** square: every attacker has a ball. */
  ballEach?: boolean
  /** square: always this many grids. */
  grids?: 2
  /** square: a third of the players hunt the ball. */
  third?: boolean
  /** game: no goals, keep the ball. */
  noGoals?: boolean
  /** game: one team has a keeper. */
  keeper?: boolean
  /** shoot: shots come from different angles. */
  angle?: boolean
  /** pairs: partners 20 to 40 m apart (long passes, a keeper's distribution). */
  long?: boolean
  /** free: a ball each and no partner. */
  solo?: boolean
  /** func: always this many attackers v defenders in each turn. */
  group?: readonly [attackers: number, defenders: number]
  why: string
  how: readonly string[]
  watch: readonly string[]
  /** Words a coach might search for that aren't in the drill's name or type. */
  topics: string
}

/** Library order: Get ready, Technical, Skill, Game related; each by its drill type, team drills before individual. */
export const LIBRARY: readonly LibraryDrill[] = [
  {
    id: 'lib-moving-warm-up', ...TEXT['lib-moving-warm-up'], kind: 'warmup', type: 'Dry warm-up', focus: 'team', template: 'warm',
  },
  {
    id: 'lib-tag-games', ...TEXT['lib-tag-games'], kind: 'warmup', type: 'Dry warm-up', focus: 'team', template: 'warm',
  },
  {
    id: 'lib-speed-circuit', ...TEXT['lib-speed-circuit'], kind: 'warmup', type: 'Dry warm-up', focus: 'team', template: 'warm',
  },
  {
    id: 'lib-easy-jog-and-stretch', ...TEXT['lib-easy-jog-and-stretch'], kind: 'warmup', type: 'Cool-down', focus: 'team', template: 'warm',
  },
  {
    id: 'lib-walk-pass-and-talk', ...TEXT['lib-walk-pass-and-talk'], kind: 'warmup', type: 'Cool-down', focus: 'team', template: 'pairs',
  },
  {
    id: 'lib-pass-and-follow', ...TEXT['lib-pass-and-follow'], kind: 'technical', type: 'Passing', focus: 'team', template: 'groups',
  },
  {
    id: 'lib-move-away-come-back', ...TEXT['lib-move-away-come-back'], kind: 'technical', type: 'Passing', focus: 'team', template: 'groups',
  },
  {
    id: 'lib-y-shape-passing', ...TEXT['lib-y-shape-passing'], kind: 'technical', type: 'Passing', focus: 'team', template: 'groups',
  },
  {
    id: 'lib-pass-through-the-gate', ...TEXT['lib-pass-through-the-gate'], kind: 'technical', type: 'Passing', focus: 'individual', template: 'pairs',
    overlay: 'gate',
  },
  {
    id: 'lib-first-touch-and-turn', ...TEXT['lib-first-touch-and-turn'], kind: 'technical', type: 'Passing', focus: 'individual', template: 'pairs',
  },
  {
    id: 'lib-long-pass-and-control', ...TEXT['lib-long-pass-and-control'], kind: 'technical', type: 'Passing', focus: 'individual', template: 'pairs',
    long: true, 
  },
  {
    id: 'lib-shift-with-the-ball', ...TEXT['lib-shift-with-the-ball'], kind: 'technical', type: 'Pressing movement', focus: 'team', template: 'groups',
    shadow: true,
  },
  {
    id: 'lib-step-up-together', ...TEXT['lib-step-up-together'], kind: 'technical', type: 'Pressing movement', focus: 'team', template: 'groups',
    shadow: true,
  },
  {
    id: 'lib-dribble-through-the-gates', ...TEXT['lib-dribble-through-the-gates'], kind: 'technical', type: 'Follow and copy', focus: 'team', template: 'free',
    solo: true, overlay: 'gates', 
  },
  {
    id: 'lib-look-and-call', ...TEXT['lib-look-and-call'], kind: 'technical', type: 'Repetition', focus: 'team', template: 'groups',
    shadow: true,
  },
  {
    id: 'lib-dribble-and-swap', ...TEXT['lib-dribble-and-swap'], kind: 'technical', type: 'Repetition', focus: 'individual', template: 'pairs',
  },
  {
    id: 'lib-shoot-from-the-line', ...TEXT['lib-shoot-from-the-line'], kind: 'technical', type: 'Repetition', focus: 'individual', template: 'shoot',
  },
  {
    id: 'lib-one-two-and-finish', ...TEXT['lib-one-two-and-finish'], kind: 'technical', type: 'Repetition', focus: 'team', template: 'shoot',
  },
  {
    id: 'lib-turn-and-shoot', ...TEXT['lib-turn-and-shoot'], kind: 'technical', type: 'Repetition', focus: 'individual', template: 'shoot',
    angle: true,
  },
  {
    id: 'lib-tackle-practice', ...TEXT['lib-tackle-practice'], kind: 'technical', type: 'Repetition', focus: 'individual', template: 'pairs',
  },
  {
    id: 'lib-get-set-and-catch', ...TEXT['lib-get-set-and-catch'], kind: 'technical', type: 'Repetition', focus: 'goalkeeping', template: 'shoot',
  },
  {
    id: 'lib-cover-the-angle', ...TEXT['lib-cover-the-angle'], kind: 'technical', type: 'Repetition', focus: 'goalkeeping', template: 'shoot',
    angle: true,
  },
  {
    id: 'lib-save-and-get-up', ...TEXT['lib-save-and-get-up'], kind: 'technical', type: 'Repetition', focus: 'goalkeeping', template: 'shoot',
    angle: true,
  },
  {
    id: 'lib-throw-and-roll-out', ...TEXT['lib-throw-and-roll-out'], kind: 'technical', type: 'Repetition', focus: 'goalkeeping', template: 'pairs',
    long: true, 
  },
  {
    id: 'lib-sweep-behind-the-line', ...TEXT['lib-sweep-behind-the-line'], kind: 'technical', type: 'Repetition', focus: 'goalkeeping', template: 'shoot',
  },
  {
    id: 'lib-keep-the-ball', ...TEXT['lib-keep-the-ball'], kind: 'skill', type: 'Rondos', focus: 'team', template: 'square',
  },
  {
    id: 'lib-four-corners', ...TEXT['lib-four-corners'], kind: 'skill', type: 'Rondos', focus: 'team', template: 'square',
    overlay: 'quarters',
  },
  {
    id: 'lib-pass-between-defenders', ...TEXT['lib-pass-between-defenders'], kind: 'skill', type: 'Rondos', focus: 'team', template: 'square',
    overlay: 'split',
  },
  {
    id: 'lib-block-the-gates', ...TEXT['lib-block-the-gates'], kind: 'skill', type: 'Rondos', focus: 'team', template: 'square',
    overlay: 'gates',
  },
  {
    id: 'lib-press-as-a-group', ...TEXT['lib-press-as-a-group'], kind: 'skill', type: 'Rondos', focus: 'team', template: 'square',
  },
  {
    id: 'lib-intercept-the-pass', ...TEXT['lib-intercept-the-pass'], kind: 'skill', type: 'Rondos', focus: 'team', template: 'square',
  },
  {
    id: 'lib-overlap-and-finish', ...TEXT['lib-overlap-and-finish'], kind: 'skill', type: 'Attack in turns', focus: 'team', template: 'func',
  },
  {
    id: 'lib-through-ball-and-finish', ...TEXT['lib-through-ball-and-finish'], kind: 'skill', type: 'Attack in turns', focus: 'team', template: 'func',
  },
  {
    id: 'lib-defend-each-attack', ...TEXT['lib-defend-each-attack'], kind: 'skill', type: 'Attack in turns', focus: 'team', template: 'func',
  },
  {
    id: 'lib-intercept-and-counter', ...TEXT['lib-intercept-and-counter'], kind: 'skill', type: 'Attack in turns', focus: 'team', template: 'func',
  },
  {
    id: 'lib-1v1-to-goal', ...TEXT['lib-1v1-to-goal'], kind: 'skill', type: 'Attack in turns', focus: 'team', template: 'func',
    group: [1, 1], 
  },
  {
    id: 'lib-win-it-pass-it-out', ...TEXT['lib-win-it-pass-it-out'], kind: 'skill', type: 'Win it and get out', focus: 'team', template: 'square',
    grids: 2, 
  },
  {
    id: 'lib-keep-it-with-spare-players', ...TEXT['lib-keep-it-with-spare-players'], kind: 'skill', type: 'Possession', focus: 'team', template: 'game',
    noGoals: true,
  },
  {
    id: 'lib-switch-the-play', ...TEXT['lib-switch-the-play'], kind: 'skill', type: 'Possession', focus: 'team', template: 'game',
    overlay: 'wide', noGoals: true,
  },
  {
    id: 'lib-three-team-keep-ball', ...TEXT['lib-three-team-keep-ball'], kind: 'skill', type: 'Whole squad', focus: 'team', template: 'square',
    third: true,
  },
  {
    id: 'lib-protect-your-ball', ...TEXT['lib-protect-your-ball'], kind: 'skill', type: 'Whole squad', focus: 'individual', template: 'square',
    ballEach: true,
  },
  {
    id: 'lib-pass-then-score', ...TEXT['lib-pass-then-score'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
  },
  {
    id: 'lib-go-wide-first', ...TEXT['lib-go-wide-first'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
    overlay: 'wide',
  },
  {
    id: 'lib-end-zone-game', ...TEXT['lib-end-zone-game'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
    overlay: 'endzones',
  },
  {
    id: 'lib-protect-the-middle', ...TEXT['lib-protect-the-middle'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
    overlay: 'middle',
  },
  {
    id: 'lib-push-them-wide', ...TEXT['lib-push-them-wide'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
    overlay: 'wide',
  },
  {
    id: 'lib-win-it-and-go', ...TEXT['lib-win-it-and-go'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
  },
  {
    id: 'lib-shoot-early', ...TEXT['lib-shoot-early'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
  },
  {
    id: 'lib-just-play', ...TEXT['lib-just-play'], kind: 'game', type: 'Small-sided games', focus: 'team', template: 'game',
  },
  {
    id: 'lib-attack-down-the-side', ...TEXT['lib-attack-down-the-side'], kind: 'game', type: 'Position practice', focus: 'team', template: 'funcm',
    overlay: 'wide',
  },
  {
    id: 'lib-hold-the-line', ...TEXT['lib-hold-the-line'], kind: 'game', type: 'Position practice', focus: 'team', template: 'funcm',
  },
  {
    id: 'lib-build-through-midfield', ...TEXT['lib-build-through-midfield'], kind: 'game', type: 'Position practice', focus: 'team', template: 'funcm',
    overlay: 'middle', 
  },
  {
    id: 'lib-play-out-from-the-keeper', ...TEXT['lib-play-out-from-the-keeper'], kind: 'game', type: 'Attack v defence', focus: 'team', template: 'game',
    overlay: 'target', keeper: true,
  },
  {
    id: 'lib-press-from-the-front', ...TEXT['lib-press-from-the-front'], kind: 'game', type: 'Attack v defence', focus: 'team', template: 'game',
    overlay: 'target', keeper: true,
  },
]

/** TRAK-388 (Kostas, 9 Nov) and the 10 Nov read-through (merged into another drill): drills taken out of the Library. A saved plan can still name them, so they stay findable
 *  by id; they're never listed, searched or offered. */
const RETIRED: readonly LibraryDrill[] = [
  {
    id: 'lib-steal-the-ball', ...TEXT['lib-steal-the-ball'], kind: 'skill', type: 'Whole squad', focus: 'individual', template: 'square',
    ballEach: true,
  },
  {
    id: 'lib-win-it-back-in-five', ...TEXT['lib-win-it-back-in-five'], kind: 'skill', type: 'Win it and get out', focus: 'team', template: 'square',
  },
  {
    id: 'lib-cross-and-attack-the-box', ...TEXT['lib-cross-and-attack-the-box'], kind: 'skill', type: 'Attack in turns', focus: 'team', template: 'func',
    overlay: 'wide', 
  },
  {
    id: 'lib-copy-your-partner', ...TEXT['lib-copy-your-partner'], kind: 'warmup', type: 'Dry warm-up', focus: 'team', template: 'warm',
  },

  {
    id: 'lib-follow-and-copy', ...TEXT['lib-follow-and-copy'], kind: 'technical', type: 'Follow and copy', focus: 'team', template: 'free',
  },
]

const byId = new Map([...LIBRARY, ...RETIRED].map(d => [d.id, d]))

/** A Library drill by its id, retired ones included, or undefined (an old shelf id). */
export const libraryDrill = (id: string | null | undefined) => (id ? byId.get(id) : undefined)

/** Another drill (TRAK-389): the next one of the same drill type, round to the first; when the type has only this one,
 *  the next of the same kind. Null when it's alone in its kind. */
export function anotherDrill(d: Pick<LibraryDrill, 'id' | 'kind' | 'type'>): LibraryDrill | null {
  let pool = LIBRARY.filter(x => x.kind === d.kind && x.type === d.type)
  if (pool.length < 2) pool = LIBRARY.filter(x => x.kind === d.kind)
  if (pool.length < 2) return null
  return pool[(pool.findIndex(x => x.id === d.id) + 1) % pool.length]
}
