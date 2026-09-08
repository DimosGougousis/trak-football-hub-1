import type { FC } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiagramPlayer = {
  x: number       // 0 = left edge, 1 = right edge
  y: number       // 0 = top edge,  1 = bottom edge
  team: 'A' | 'B' | 'N'  // A = attacking/lime, B = defending/orange, N = neutral/white
  label?: string
}
export type DiagramCone  = { x: number; y: number }
export type DiagramArrow = {
  from:  [number, number]
  to:    [number, number]
  style?: 'pass' | 'run' | 'press'
}
export type DiagramData = {
  id?:      string
  title?:   string
  pitch?:   'grid' | 'half'
  players?: DiagramPlayer[]
  cones?:   DiagramCone[]
  arrows?:  DiagramArrow[]
}

// ── SVG constants ─────────────────────────────────────────────────────────────

const W  = 240, H  = 158
const PX = 18,  PY = 16
const PW = W - PX * 2   // 204
const PH = H - PY * 2   // 126
const R  = 11            // player circle radius

const TEAM: Record<string, { bg: string; text: string }> = {
  A: { bg: '#C8F25A',              text: '#000' },
  B: { bg: '#fb923c',              text: '#000' },
  N: { bg: 'rgba(255,255,255,.84)', text: '#000' },
}
const ARROW: Record<string, { color: string; dash?: string; mid: string }> = {
  pass:  { color: 'rgba(200,242,90,.75)',  dash: '5 3', mid: 'arr-pass'  },
  run:   { color: 'rgba(255,255,255,.50)', dash: undefined, mid: 'arr-run'  },
  press: { color: 'rgba(251,146,60,.75)',  dash: '3 3', mid: 'arr-press' },
}

const tx = (x: number) => PX + Math.max(0, Math.min(1, x)) * PW
const ty = (y: number) => PY + Math.max(0, Math.min(1, y)) * PH

function arrowPath(from: [number, number], to: [number, number]) {
  const x1 = tx(from[0]), y1 = ty(from[1]), x2 = tx(to[0]), y2 = ty(to[1])
  const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1
  const m = (R + 1) / len
  return `M ${(x1 + dx * m).toFixed(1)},${(y1 + dy * m).toFixed(1)} L ${(x2 - dx * m).toFixed(1)},${(y2 - dy * m).toFixed(1)}`
}

// ── Preset drill diagrams ─────────────────────────────────────────────────────

const CORNERS: DiagramCone[] = [
  { x: 0.03, y: 0.03 }, { x: 0.97, y: 0.03 },
  { x: 0.03, y: 0.97 }, { x: 0.97, y: 0.97 },
]

export const PRESETS: Record<string, DiagramData> = {

  // ── Rondos ──────────────────────────────────────────────────────────────────

  rondo_4v1: {
    id: 'rondo_4v1',
    title: 'Rondo 4v1',
    pitch: 'grid',
    players: [
      { x: 0.50, y: 0.07, team: 'A', label: '1' },
      { x: 0.93, y: 0.50, team: 'A', label: '2' },
      { x: 0.50, y: 0.93, team: 'A', label: '3' },
      { x: 0.07, y: 0.50, team: 'A', label: '4' },
      { x: 0.50, y: 0.50, team: 'B', label: 'D' },
    ],
    cones: CORNERS,
    arrows: [
      { from: [0.50, 0.07], to: [0.93, 0.50], style: 'pass' },
    ],
  },

  rondo_5v2: {
    id: 'rondo_5v2',
    title: 'Rondo 5v2',
    pitch: 'grid',
    players: [
      { x: 0.50, y: 0.06, team: 'A', label: '1' },
      { x: 0.88, y: 0.31, team: 'A', label: '2' },
      { x: 0.76, y: 0.88, team: 'A', label: '3' },
      { x: 0.24, y: 0.88, team: 'A', label: '4' },
      { x: 0.12, y: 0.31, team: 'A', label: '5' },
      { x: 0.38, y: 0.50, team: 'B', label: 'D' },
      { x: 0.62, y: 0.50, team: 'B', label: 'D' },
    ],
    cones: CORNERS,
    arrows: [
      { from: [0.50, 0.06], to: [0.88, 0.31], style: 'pass' },
      { from: [0.88, 0.31], to: [0.76, 0.88], style: 'pass' },
    ],
  },

  rondo_6v3: {
    id: 'rondo_6v3',
    title: 'Rondo 6v3',
    pitch: 'grid',
    players: [
      { x: 0.50, y: 0.05, team: 'A', label: '1' },
      { x: 0.87, y: 0.27, team: 'A', label: '2' },
      { x: 0.87, y: 0.73, team: 'A', label: '3' },
      { x: 0.50, y: 0.95, team: 'A', label: '4' },
      { x: 0.13, y: 0.73, team: 'A', label: '5' },
      { x: 0.13, y: 0.27, team: 'A', label: '6' },
      { x: 0.50, y: 0.38, team: 'B', label: 'D' },
      { x: 0.36, y: 0.65, team: 'B', label: 'D' },
      { x: 0.64, y: 0.65, team: 'B', label: 'D' },
    ],
    cones: CORNERS,
    arrows: [
      { from: [0.50, 0.05], to: [0.87, 0.73], style: 'pass' },
    ],
  },

  // Transition Rondo 4v2+2: 4 keep from 2, with 2 neutral jokers on outside edges
  transition_rondo: {
    id: 'transition_rondo',
    title: 'Transition Rondo 4v2+2',
    pitch: 'grid',
    players: [
      // 4 attackers inside the grid at corners
      { x: 0.22, y: 0.28, team: 'A', label: '1' },
      { x: 0.78, y: 0.28, team: 'A', label: '2' },
      { x: 0.22, y: 0.72, team: 'A', label: '3' },
      { x: 0.78, y: 0.72, team: 'A', label: '4' },
      // 2 defenders inside
      { x: 0.42, y: 0.50, team: 'B', label: 'D' },
      { x: 0.58, y: 0.50, team: 'B', label: 'D' },
      // 2 neutral jokers on the top and bottom edges
      { x: 0.50, y: 0.03, team: 'N', label: 'J' },
      { x: 0.50, y: 0.97, team: 'N', label: 'J' },
    ],
    cones: CORNERS,
    arrows: [
      { from: [0.22, 0.28], to: [0.50, 0.03], style: 'pass' },  // pass to top joker
      { from: [0.50, 0.03], to: [0.78, 0.28], style: 'pass' },  // joker plays on
    ],
  },

  // ── Small-Sided Games ────────────────────────────────────────────────────────

  ssg_3v3: {
    id: 'ssg_3v3',
    title: 'SSG 3v3',
    pitch: 'grid',
    players: [
      { x: 0.15, y: 0.30, team: 'A', label: '1' },
      { x: 0.15, y: 0.70, team: 'A', label: '2' },
      { x: 0.32, y: 0.50, team: 'A', label: '3' },
      { x: 0.85, y: 0.30, team: 'B', label: '1' },
      { x: 0.85, y: 0.70, team: 'B', label: '2' },
      { x: 0.68, y: 0.50, team: 'B', label: '3' },
    ],
    cones: [
      // Goal A (left)
      { x: 0.03, y: 0.38 }, { x: 0.03, y: 0.62 },
      // Goal B (right)
      { x: 0.97, y: 0.38 }, { x: 0.97, y: 0.62 },
    ],
    arrows: [
      { from: [0.32, 0.50], to: [0.68, 0.50], style: 'run' },
    ],
  },

  ssg_4v4: {
    id: 'ssg_4v4',
    title: 'SSG 4v4',
    pitch: 'grid',
    players: [
      { x: 0.14, y: 0.22, team: 'A', label: '1' },
      { x: 0.14, y: 0.78, team: 'A', label: '2' },
      { x: 0.30, y: 0.38, team: 'A', label: '3' },
      { x: 0.30, y: 0.62, team: 'A', label: '4' },
      { x: 0.86, y: 0.22, team: 'B', label: '1' },
      { x: 0.86, y: 0.78, team: 'B', label: '2' },
      { x: 0.70, y: 0.38, team: 'B', label: '3' },
      { x: 0.70, y: 0.62, team: 'B', label: '4' },
    ],
    cones: [
      { x: 0.03, y: 0.36 }, { x: 0.03, y: 0.64 },
      { x: 0.97, y: 0.36 }, { x: 0.97, y: 0.64 },
    ],
    arrows: [
      { from: [0.30, 0.38], to: [0.70, 0.38], style: 'run' },
    ],
  },

  ssg_5v5: {
    id: 'ssg_5v5',
    title: 'SSG 5v5',
    pitch: 'grid',
    players: [
      { x: 0.10, y: 0.50, team: 'A', label: '1' },
      { x: 0.24, y: 0.18, team: 'A', label: '2' },
      { x: 0.24, y: 0.82, team: 'A', label: '3' },
      { x: 0.38, y: 0.36, team: 'A', label: '4' },
      { x: 0.38, y: 0.64, team: 'A', label: '5' },
      { x: 0.90, y: 0.50, team: 'B', label: '1' },
      { x: 0.76, y: 0.18, team: 'B', label: '2' },
      { x: 0.76, y: 0.82, team: 'B', label: '3' },
      { x: 0.62, y: 0.36, team: 'B', label: '4' },
      { x: 0.62, y: 0.64, team: 'B', label: '5' },
    ],
    cones: [
      { x: 0.03, y: 0.37 }, { x: 0.03, y: 0.63 },
      { x: 0.97, y: 0.37 }, { x: 0.97, y: 0.63 },
    ],
  },

  // ── Technical Drills ─────────────────────────────────────────────────────────

  passing_gates: {
    id: 'passing_gates',
    title: 'Passing Through Gates',
    pitch: 'grid',
    players: [
      { x: 0.12, y: 0.50, team: 'A', label: '1' },
      { x: 0.88, y: 0.50, team: 'A', label: '2' },
      { x: 0.50, y: 0.18, team: 'A', label: '3' },
      { x: 0.50, y: 0.82, team: 'A', label: '4' },
    ],
    cones: [
      // 4 gates — each gate is 2 cones close together
      { x: 0.33, y: 0.40 }, { x: 0.33, y: 0.60 },  // Gate 1 centre-left
      { x: 0.67, y: 0.40 }, { x: 0.67, y: 0.60 },  // Gate 2 centre-right
      { x: 0.50, y: 0.33 }, { x: 0.38, y: 0.33 },  // Gate 3 top
      { x: 0.50, y: 0.67 }, { x: 0.38, y: 0.67 },  // Gate 4 bottom
    ],
    arrows: [
      { from: [0.12, 0.50], to: [0.33, 0.50], style: 'pass' },
      { from: [0.88, 0.50], to: [0.67, 0.50], style: 'pass' },
    ],
  },

  overlap_2v1: {
    id: 'overlap_2v1',
    title: '2v1 Overlap',
    pitch: 'grid',
    players: [
      { x: 0.15, y: 0.55, team: 'A', label: '1' },  // ball carrier
      { x: 0.32, y: 0.25, team: 'A', label: '2' },  // overlapping runner
      { x: 0.55, y: 0.55, team: 'B', label: 'D' },  // single defender
    ],
    arrows: [
      { from: [0.15, 0.55], to: [0.55, 0.55], style: 'run'  },  // drive at defender
      { from: [0.32, 0.25], to: [0.80, 0.25], style: 'run'  },  // overlap run wide
      { from: [0.15, 0.55], to: [0.80, 0.25], style: 'pass' },  // play into space
    ],
  },

  finishing_1v1: {
    id: 'finishing_1v1',
    title: '1v1 Finishing',
    pitch: 'half',
    players: [
      { x: 0.50, y: 0.26, team: 'A', label: 'A' },   // attacker
      { x: 0.50, y: 0.56, team: 'B', label: 'D' },   // defender
    ],
    arrows: [
      { from: [0.50, 0.26], to: [0.50, 0.92], style: 'run' },
    ],
  },

  crossing_drill: {
    id: 'crossing_drill',
    title: 'Crossing & Finishing',
    pitch: 'half',
    players: [
      { x: 0.88, y: 0.22, team: 'A', label: 'W' },   // wide player with ball
      { x: 0.48, y: 0.34, team: 'A', label: 'S' },   // striker near post
      { x: 0.28, y: 0.50, team: 'A', label: '8' },   // midfield runner far post
      { x: 0.52, y: 0.60, team: 'B', label: 'D' },   // defender
    ],
    arrows: [
      { from: [0.88, 0.22], to: [0.48, 0.80], style: 'pass' },  // cross into box
      { from: [0.48, 0.34], to: [0.48, 0.80], style: 'run'  },  // striker near post run
      { from: [0.28, 0.50], to: [0.60, 0.80], style: 'run'  },  // late run far post
    ],
  },

  diamond_passing: {
    id: 'diamond_passing',
    title: 'Diamond Passing Pattern',
    pitch: 'grid',
    players: [
      { x: 0.50, y: 0.06, team: 'A', label: '1' },  // top
      { x: 0.90, y: 0.50, team: 'A', label: '2' },  // right
      { x: 0.50, y: 0.94, team: 'A', label: '3' },  // bottom
      { x: 0.10, y: 0.50, team: 'A', label: '4' },  // left
      { x: 0.50, y: 0.50, team: 'A', label: '5' },  // centre
    ],
    arrows: [
      { from: [0.50, 0.06], to: [0.90, 0.50], style: 'pass' },
      { from: [0.90, 0.50], to: [0.50, 0.50], style: 'pass' },
      { from: [0.50, 0.50], to: [0.10, 0.50], style: 'pass' },
      { from: [0.10, 0.50], to: [0.50, 0.94], style: 'pass' },
    ],
  },

  // ── Tactical Drills ──────────────────────────────────────────────────────────

  counter_attack: {
    id: 'counter_attack',
    title: 'Counter-Attack 4v2',
    pitch: 'grid',
    players: [
      // 4 attacking players breaking forward
      { x: 0.22, y: 0.50, team: 'A', label: '1' },  // ball carrier
      { x: 0.40, y: 0.25, team: 'A', label: '2' },  // wide right
      { x: 0.40, y: 0.75, team: 'A', label: '3' },  // wide left
      { x: 0.62, y: 0.50, team: 'A', label: '4' },  // forward run
      // 2 recovering defenders
      { x: 0.72, y: 0.28, team: 'B', label: 'D' },
      { x: 0.72, y: 0.72, team: 'B', label: 'D' },
    ],
    arrows: [
      { from: [0.22, 0.50], to: [0.40, 0.25], style: 'pass' },
      { from: [0.40, 0.25], to: [0.62, 0.50], style: 'run'  },
      { from: [0.40, 0.75], to: [0.62, 0.50], style: 'run'  },
    ],
  },

  pressing: {
    id: 'pressing',
    title: 'Coordinated Press',
    pitch: 'grid',
    players: [
      // Ball-playing team (B) in build-up
      { x: 0.18, y: 0.50, team: 'B', label: 'K' },  // keeper/GK
      { x: 0.32, y: 0.22, team: 'B', label: 'D' },  // right CB
      { x: 0.32, y: 0.78, team: 'B', label: 'D' },  // left CB
      { x: 0.50, y: 0.50, team: 'B', label: 'M' },  // midfielder
      // Pressing team (A) closing down
      { x: 0.48, y: 0.22, team: 'A', label: 'P' },  // press right CB
      { x: 0.65, y: 0.50, team: 'A', label: 'P' },  // press midfielder
      { x: 0.48, y: 0.78, team: 'A', label: 'P' },  // press left CB
    ],
    arrows: [
      { from: [0.48, 0.22], to: [0.32, 0.22], style: 'press' },
      { from: [0.65, 0.50], to: [0.50, 0.50], style: 'press' },
      { from: [0.48, 0.78], to: [0.32, 0.78], style: 'press' },
    ],
  },

  shadow_pressing: {
    id: 'shadow_pressing',
    title: 'Shadow Pressing Shape',
    pitch: 'grid',
    players: [
      // Team walking through their pressing shape (no opponents — ghost positions)
      { x: 0.50, y: 0.50, team: 'A', label: 'P' },  // striker press trigger
      { x: 0.35, y: 0.28, team: 'A', label: 'P' },  // pressing wide right
      { x: 0.35, y: 0.72, team: 'A', label: 'P' },  // pressing wide left
      { x: 0.20, y: 0.40, team: 'A', label: 'M' },  // midfield cover right
      { x: 0.20, y: 0.60, team: 'A', label: 'M' },  // midfield cover left
      // Ghost targets (opponents in slow motion — shown as neutrals)
      { x: 0.72, y: 0.28, team: 'N', label: '·' },
      { x: 0.72, y: 0.72, team: 'N', label: '·' },
      { x: 0.88, y: 0.50, team: 'N', label: '·' },
    ],
    arrows: [
      { from: [0.50, 0.50], to: [0.72, 0.28], style: 'press' },
      { from: [0.35, 0.28], to: [0.72, 0.28], style: 'press' },
    ],
  },

  positional_rondo: {
    id: 'positional_rondo',
    title: 'Positional Rondo',
    pitch: 'grid',
    players: [
      { x: 0.10, y: 0.50, team: 'A', label: '1' },
      { x: 0.50, y: 0.08, team: 'A', label: '2' },
      { x: 0.90, y: 0.50, team: 'A', label: '3' },
      { x: 0.50, y: 0.92, team: 'A', label: '4' },
      { x: 0.50, y: 0.50, team: 'N', label: 'J' },  // joker in middle
      { x: 0.36, y: 0.38, team: 'B', label: 'D' },
      { x: 0.64, y: 0.62, team: 'B', label: 'D' },
    ],
    cones: CORNERS,
    arrows: [
      { from: [0.10, 0.50], to: [0.50, 0.50], style: 'pass' },
      { from: [0.50, 0.50], to: [0.90, 0.50], style: 'pass' },
    ],
  },

  // ── Warm-Up / Movement ───────────────────────────────────────────────────────

  warm_up: {
    id: 'warm_up',
    title: 'Warm-Up Keep-Ball',
    pitch: 'grid',
    players: [
      { x: 0.20, y: 0.20, team: 'A', label: '1' },
      { x: 0.80, y: 0.20, team: 'A', label: '2' },
      { x: 0.50, y: 0.50, team: 'A', label: '3' },
      { x: 0.20, y: 0.80, team: 'A', label: '4' },
      { x: 0.80, y: 0.80, team: 'A', label: '5' },
      { x: 0.40, y: 0.35, team: 'B', label: 'D' },
      { x: 0.60, y: 0.65, team: 'B', label: 'D' },
    ],
    cones: CORNERS,
    arrows: [
      { from: [0.20, 0.20], to: [0.50, 0.50], style: 'pass' },
      { from: [0.50, 0.50], to: [0.80, 0.80], style: 'pass' },
    ],
  },
}

// ── Drill detection from AI text ──────────────────────────────────────────────
// Scans the AI response for bolded/heading drill names and maps them to presets.

export function detectDiagrams(text: string): DiagramData[] {
  const results: DiagramData[] = []
  const seen = new Set<string>()

  const add = (key: string) => {
    if (!seen.has(key) && PRESETS[key]) {
      seen.add(key)
      results.push(PRESETS[key])
    }
  }

  // Extract bolded phrases and markdown headings
  const tokens: string[] = []
  const boldRe = /\*\*([^*\n]{2,60})\*\*/g
  const headRe = /^#{1,4}\s+(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = boldRe.exec(text)) !== null) tokens.push(m[1])
  while ((m = headRe.exec(text)) !== null) tokens.push(m[1])

  for (const tok of tokens) {
    const t = tok.toLowerCase()

    // ── Rondos (check before generic 4v2 / 5v5 etc.) ──
    if (/rondo|keep.?ball|possession circle/.test(t)) {
      if (/6.?v.?3/.test(t))                                     add('rondo_6v3')
      else if (/5.?v.?2/.test(t))                                add('rondo_5v2')
      else if (/4.?v.?1/.test(t))                                add('rondo_4v1')
      else if (/positional/.test(t))                             add('positional_rondo')
      else if (/transition|4.?v.?2|joker|\+\s*2/.test(t))       add('transition_rondo')
      else                                                        add('rondo_4v1')
    }

    // ── Transition Rondo (may not contain the word "rondo") ──
    else if (/transition rondo|4.?v.?2.*\+.*2|\+2.*4.?v.?2|joker rondo/.test(t)) add('transition_rondo')

    // ── Small-Sided Games ──
    else if (/5.?v.?5/.test(t))                                  add('ssg_5v5')
    else if (/4.?v.?4/.test(t))                                  add('ssg_4v4')
    else if (/3.?v.?3/.test(t))                                  add('ssg_3v3')
    else if (/small.?sided game|ssg\b/.test(t))                  add('ssg_4v4')

    // ── 1v1 / 2v1 ──
    else if (/1.?v.?1/.test(t))                                  add('finishing_1v1')
    else if (/2.?v.?1|overlap/.test(t))                          add('overlap_2v1')

    // ── Counter-Attack ──
    else if (/counter.?attack|4.?v.?2.*counter|quick break|transition.*attack/.test(t)) add('counter_attack')

    // ── Technical patterns ──
    else if (/diamond.*pass|passing.*diamond/.test(t))           add('diamond_passing')
    else if (/diamond/.test(t))                                  add('diamond_passing')
    else if (/passing.*gate|gate.*passing|pass.*through.*gate/.test(t)) add('passing_gates')

    // ── Wide play ──
    else if (/crossing|cross.*finish|cross.*box|wide.*play|winger/.test(t)) add('crossing_drill')

    // ── Pressing ──
    else if (/shadow press|walk.*through.*shape|pressing shape/.test(t)) add('shadow_pressing')
    else if (/coordinated press|press trigger|team press|gegenpressing/.test(t)) add('pressing')
    else if (/press(?:ing)?\b/.test(t) && !/shadow/.test(t))    add('pressing')

    // ── Warm-up ──
    else if (/warm.?up|activation|possession warm/.test(t))      add('warm_up')
  }

  return results
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PitchDiagram: FC<{ data: DiagramData }> = ({ data }) => {
  const players = data.players ?? []
  const cones   = data.cones   ?? []
  const arrows  = data.arrows  ?? []
  const isHalf  = data.pitch === 'half'

  return (
    <div className="mt-3 rounded-[14px] overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.09)' }}>

      {/* Title bar */}
      {data.title && (
        <div className="px-3 py-1.5"
          style={{ background: '#0d0d0f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
          }}>
            {data.title}
          </span>
        </div>
      )}

      {/* SVG pitch */}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ background: '#0c160c', display: 'block' }}>
        <defs>
          {Object.entries(ARROW).map(([key, s]) => (
            <marker key={key} id={s.mid} markerWidth="6" markerHeight="6"
              refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={s.color} />
            </marker>
          ))}
        </defs>

        {/* Pitch rectangle */}
        <rect x={PX} y={PY} width={PW} height={PH} rx="2"
          fill="rgba(255,255,255,0.016)"
          stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

        {isHalf ? (
          <>
            {/* Goal */}
            <rect x={PX + PW * 0.35} y={PY + PH - 2} width={PW * 0.3} height={9}
              fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
            {/* Penalty area */}
            <rect x={PX + PW * 0.18} y={PY + PH * 0.52}
              width={PW * 0.64} height={PH * 0.48}
              fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            {/* Penalty spot */}
            <circle cx={PX + PW * 0.5} cy={PY + PH * 0.76} r="2"
              fill="rgba(255,255,255,0.28)" />
            {/* D arc */}
            <path d={`M ${PX + PW * 0.30},${PY + PH * 0.52} A ${PW * 0.20} ${PW * 0.20} 0 0 0 ${PX + PW * 0.70},${PY + PH * 0.52}`}
              fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          </>
        ) : (
          <>
            {/* Grid dashes */}
            <line x1={PX + PW * 0.5} y1={PY} x2={PX + PW * 0.5} y2={PY + PH}
              stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 4" />
            <line x1={PX} y1={PY + PH * 0.5} x2={PX + PW} y2={PY + PH * 0.5}
              stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 4" />
          </>
        )}

        {/* Cones */}
        {cones.map((c, i) => (
          <polygon key={i}
            points={`${tx(c.x)},${ty(c.y) - 7} ${tx(c.x) + 5.5},${ty(c.y) + 4} ${tx(c.x) - 5.5},${ty(c.y) + 4}`}
            fill="#fbbf24" opacity="0.9" />
        ))}

        {/* Arrows */}
        {arrows.map((a, i) => {
          const s = ARROW[a.style ?? 'pass'] ?? ARROW.pass
          return (
            <path key={i} d={arrowPath(a.from, a.to)}
              stroke={s.color} strokeWidth="1.6"
              strokeDasharray={s.dash} fill="none"
              markerEnd={`url(#${s.mid})`} />
          )
        })}

        {/* Players */}
        {players.map((p, i) => {
          const cx = tx(p.x), cy = ty(p.y)
          const s = TEAM[p.team] ?? TEAM.A
          const lbl = (p.label ?? '').slice(0, 2)
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={R} fill={s.bg}
                stroke="rgba(0,0,0,0.22)" strokeWidth="1" />
              <text x={cx} y={cy + 3.8} textAnchor="middle"
                style={{ fontSize: lbl.length > 1 ? 7.5 : 9, fontWeight: 700,
                  fontFamily: 'monospace', fill: s.text, userSelect: 'none' }}>
                {lbl}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      {(players.some(p => p.team === 'A') || players.some(p => p.team === 'B') ||
        players.some(p => p.team === 'N') || cones.length > 0 ||
        arrows.some(a => a.style === 'pass') || arrows.some(a => a.style === 'run') ||
        arrows.some(a => a.style === 'press')) && (
        <div className="flex items-center gap-4 px-3 py-2 flex-wrap"
          style={{ background: '#0d0d0f', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {players.some(p => p.team === 'A') && <Dot color="#C8F25A" label="Attacking" />}
          {players.some(p => p.team === 'B') && <Dot color="#fb923c" label="Defending" />}
          {players.some(p => p.team === 'N') && <Dot color="rgba(255,255,255,0.75)" label="Neutral / Joker" />}
          {cones.length > 0 && <Dot color="#fbbf24" cone label="Cone" />}
          {arrows.some(a => a.style === 'pass') && <ArrowKey color="rgba(200,242,90,.75)" label="Pass" dash />}
          {arrows.some(a => a.style === 'run') && <ArrowKey color="rgba(255,255,255,.50)" label="Run" />}
          {arrows.some(a => a.style === 'press') && <ArrowKey color="rgba(251,146,60,.75)" label="Press" dash />}
        </div>
      )}
    </div>
  )
}

function Dot({ color, label, cone }: { color: string; label: string; cone?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {cone
        ? <svg width="9" height="8"><polygon points="4.5,0 9,8 0,8" fill={color} /></svg>
        : <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      }
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: 8,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)',
      }}>{label}</span>
    </div>
  )
}

function ArrowKey({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="18" height="8">
        <line x1="1" y1="4" x2="13" y2="4"
          stroke={color} strokeWidth="1.5"
          strokeDasharray={dash ? '4 2' : undefined} />
        <path d="M11,1 L17,4 L11,7 Z" fill={color} />
      </svg>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: 8,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)',
      }}>{label}</span>
    </div>
  )
}
