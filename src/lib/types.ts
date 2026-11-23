export type Role = 'player' | 'coach' | 'parent' | 'club'
export type Position = 'gk' | 'def' | 'mid' | 'att'
export type Competition = 'league' | 'cup' | 'tournament' | 'friendly'
export type Venue = 'home' | 'away'
export type CardType = 'none' | 'yellow' | 'red'
export type BodyCondition = 'fresh' | 'good' | 'tired' | 'knock'
export type SelfRating = 'poor' | 'average' | 'good' | 'excellent'
export type BandType = 'exceptional' | 'good' | 'steady' | 'developing' | 'difficult'
export type MedalType = 'first_match' | 'on_a_roll' | 'first_star' | 'ten_down' | 'most_improved' | 'self_aware'
export type GoalCategory = 'performance' | 'consistency' | 'development' | 'personal'
export type ProgressLevel = 'just_started' | 'making_progress' | 'nearly_there' | 'achieved'
export type Appearance = 'started' | 'sub' | 'didnt_play' | 'training'
/** How an assessment's appearance reads (pilot coach's item 13; Imad, 19 Oct: Started, Sub, Didn't play). */
export const APPEARANCE_LABEL: Record<Appearance, string> = { started: 'Started', sub: 'Sub', didnt_play: "Didn't play", training: 'Training' }
export const appearanceLabel = (value: string | null | undefined) =>
  value ? APPEARANCE_LABEL[value as Appearance] ?? value : ''
export type SelfRatingFlag = 'fair' | 'generous' | 'way off'

export interface BandConfig {
  word: string
  /** The band's colour, for bars, dots and lines (at least 3:1 on Trak's light screen). */
  color: string
  /** The band's word written in colour: a darker shade, at least 4.5:1 on the screen and on `bg`. */
  text: string
  /** A pill's light tint, and its edge. */
  bg: string
  border: string
  minScore: number
}

// TRAK-556 (Imad, 23 Nov): five bands on whole scores, 10 Exceptional · 7–9 Good · 5–6 Steady · 3–4 Developing ·
// 0–2 Difficult. `minScore` is each band's lowest whole score; scoreToBand rounds an average first.
// TRAK-458 (Kostas, 13 Nov, "full spectrum"): each band its own bright hue, so any two tell apart at a glance:
// green, teal, blue, violet, yellow, orange, red. `color` is the bright fill (black words on it, 5:1 or more);
// `text` its darker shade for a word written in colour (4.5:1 on the page and on `bg`); `border` a darker edge, so a
// light fill (yellow, teal) still reads as a shape on the page. The word is always shown, so colour is never the only
// signal. (Before: TRAK-229's greens, slate and three close clays.)
export const BANDS: BandConfig[] = [
  { word: 'Exceptional', color: '#0A9F4A', text: '#087938', bg: '#d8f0e2', border: '#077235', minScore: 10 },
  { word: 'Good',        color: '#2F7FE0', text: '#2768b8', bg: '#deebfa', border: '#225ba1', minScore: 7 },
  { word: 'Steady',      color: '#8B5CF6', text: '#754dcf', bg: '#ece5fe', border: '#6442b1', minScore: 5 },
  { word: 'Developing',  color: '#F07A1A', text: '#a85512', bg: '#fdeada', border: '#ad5813', minScore: 3 },
  { word: 'Difficult',   color: '#E0413A', text: '#bc3731', bg: '#fae1df', border: '#a12f2a', minScore: 0 },
]

/** TRAK-189: each band's colour by name, from BANDS, for the few places that
 *  name a band directly. Every band keeps its own colour so they tell apart. */
export const BAND_COLOR = Object.fromEntries(BANDS.map(b => [b.word, b.color])) as
  Record<'Exceptional' | 'Good' | 'Steady' | 'Developing' | 'Difficult', string>
/** TRAK-229: a band's word written in colour uses this readable shade, never `color`. */
export const BAND_TEXT = Object.fromEntries(BANDS.map(b => [b.word, b.text])) as typeof BAND_COLOR

/** TRAK-555 (Imad, 23 Nov): the elastic slider's fill, one colour per score from 0 to 10 (index = score).
 *  Only the slider: band badges, bars and charts keep BANDS' seven colours. */
export const SLIDER_COLORS = ['#DC2626', '#DC2626', '#EA580C', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#059669', '#5B21B6']

/** TRAK-556: the Library's tiles, the code's tiles and How Trak works' icons borrowed band colours as decoration
 *  (Kostas, 22 Oct). They keep those colours, by their old names, when the bands change. */
export const TILE_TONES = {
  Exceptional: { text: '#087938', bg: '#d8f0e2' },
  Standout:    { text: '#0d796e', bg: '#d9f4f1' },
  Good:        { text: '#2768b8', bg: '#deebfa' },
  Steady:      { text: '#754dcf', bg: '#ece5fe' },
  Mixed:       { text: '#8c6a03', bg: '#fdf3d7' },
  Developing:  { text: '#a85512', bg: '#fdeada' },
  Difficult:   { text: '#bc3731', bg: '#fae1df' },
}
export type TileTone = keyof typeof TILE_TONES

// The one way to turn a band into its colours. Before this existed, seven call
// sites each wrote `BANDS.find(b => b.word.toLowerCase() === band)` with their
// own fallback, and four files gave up and kept a private copy of the map. One
// of those copies had different THRESHOLDS, so a score of 5 read "Mixed" on the
// player's home screen and "Steady" on their profile — same child, same number,
// two answers. Use this; do not re-derive it.
export function bandConfig(band: BandType): BandConfig {
  return BANDS.find(b => b.word.toLowerCase() === band) ?? BANDS[BANDS.length - 1]
}

export interface MatchInput {
  position: Position
  competition: Competition
  venue: Venue
  opponent: string
  score_us: number
  score_them: number
  /** TRAK-198: null is "not recorded" (the quick match log). */
  minutes_played: number | null
  card: CardType
  body_condition: BodyCondition
  self_rating: SelfRating
  position_inputs: Record<string, string | number>
  is_friendly: boolean
}

export interface Match extends MatchInput {
  id: string
  player_id: string
  computed_score: number
  band: BandType
  logged_at: string
}

export interface Assessment {
  id: string
  coach_id: string
  player_id: string
  match_id: string | null
  appearance: Appearance
  work_rate: number
  tactical: number
  attitude: number
  technical: number
  physical: number
  coachability: number
  overall_band: BandType
  self_rating_flag: SelfRatingFlag | null
  note: string | null
  assessed_at: string
}

export interface Goal {
  id: string
  player_id: string
  title: string
  category: GoalCategory
  target_number: number | null
  current_number: number
  is_auto_tracked: boolean
  tracking_field: string | null
  progress_level: ProgressLevel | null
  progress_note: string | null
  target_date: string | null
  completed: boolean
  created_at: string
}

export interface Medal {
  id: string
  player_id: string
  medal_type: MedalType
  unlocked_at: string
}

export interface Profile {
  id: string
  role: Role
  first_name: string
  last_name: string
  nationality: string | null
  created_at: string
}

export interface Player {
  id: string
  profile_id: string
  position: Position
  club: string | null
  age_group: string | null
  shirt_number: number | null
  // Legacy (TRAK-72): nobody joins by code any more; the academy roster links
  // players (J1) and guardians (J2). Kept only because the columns still exist.
  coach_invite_code: string | null
  parent_invite_code: string | null
  created_at: string
}

export interface Coach {
  id: string
  profile_id: string
  club: string | null
  age_group: string | null
  role: string | null
  invite_code: string
  created_at: string
}

export interface Parent {
  id: string
  profile_id: string
  created_at: string
}
