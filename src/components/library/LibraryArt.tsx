/* TRAK-264: the Library's pictures. The FA's sessions come with no pictures we
   may use, so a session gets a small pitch drawing in its library's colour (the
   same drawing every time for the same session), and a six-week programme gets
   an album-like stack with "6 weeks" on it. Both are decoration: the name is
   always written beside them. */

import { ON_LIBRARY } from '@/lib/fixed-colours'

type Spot = [x: number, y: number]
type Drawing = { own: Spot[]; opp: Spot[]; runs?: [Spot, Spot][]; lines?: 'halfway' | 'across' | 'diamond' }

const DRAWINGS: Drawing[] = [
  { own: [[30, 38], [34, 62], [44, 49], [22, 50]], opp: [[62, 40], [64, 61], [74, 50]], runs: [[[59, 42], [50.5, 46.5]], [[61, 58.5], [50.5, 52]]], lines: 'halfway' },
  { own: [[50, 62], [30, 70], [70, 70]], opp: [[40, 36], [60, 36]], runs: [[[42, 39.5], [47, 57]], [[58, 39.5], [53, 57]]], lines: 'across' },
  { own: [[30, 50]], opp: [[58, 40], [70, 62]], runs: [[[66, 60], [60, 43]]] },
  { own: [[38, 50]], opp: [[62, 50]], runs: [[[42, 50], [57, 50]]], lines: 'halfway' },
  { own: [[28, 34], [28, 66]], opp: [[72, 34], [72, 66]] },
  { own: [[50, 22], [76, 50], [50, 78], [24, 50]], opp: [[50, 50]], runs: [[[53, 47], [63, 37]]], lines: 'diamond' },
  { own: [[34, 44], [52, 62]], opp: [[66, 38]] },
  { own: [[30, 40], [46, 62]], opp: [[66, 44], [70, 66]], lines: 'halfway' },
]

function hash(text: string) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** A square (or `wide` 16:10) pitch drawing: filled dots are one team, rings the other. */
export function PitchArt({ seed, colour, size, wide = false, className = '' }: {
  seed: string; colour: string; size?: number; wide?: boolean; className?: string
}) {
  const drawing = DRAWINGS[hash(seed) % DRAWINGS.length]
  const flip = hash(`${seed}!`) % 2 === 1
  // Small pictures get bolder lines and dots, and fewer of the pitch's markings.
  const small = (size ?? 200) < 80
  const line = small ? 3 : 1.3
  const dot = small ? 6 : 3.2
  const x = (v: number) => (flip ? 100 - v : v)
  return (
    <span aria-hidden className={`block overflow-hidden ${className}`}
      style={{ background: colour, borderRadius: small ? 4 : 8, width: size, height: size, aspectRatio: size ? undefined : wide ? '16 / 10' : '1 / 1' }}>
      <svg viewBox={wide ? '-30 0 160 100' : '0 0 100 100'} width="100%" height="100%" className="block" fill="none" stroke={ON_LIBRARY}>
        {drawing.lines === 'diamond'
          ? <path d="M50 22 76 50 50 78 24 50z" strokeOpacity={0.45} strokeWidth={line} />
          : <rect x={10} y={16} width={80} height={68} rx={2} strokeOpacity={0.45} strokeWidth={line} />}
        {!small && drawing.lines === 'halfway' && <>
          <path d="M50 16v68" strokeOpacity={0.4} strokeWidth={line} />
          <circle cx={50} cy={50} r={9} strokeOpacity={0.4} strokeWidth={line} />
        </>}
        {!small && drawing.lines === 'across' && <path d="M10 50h80M38 16v10h24V16" strokeOpacity={0.4} strokeWidth={line} />}
        {drawing.own.map(([sx, sy], i) => <circle key={`o${i}`} cx={x(sx)} cy={sy} r={dot} fill={ON_LIBRARY} stroke="none" />)}
        {drawing.opp.map(([sx, sy], i) => <circle key={`p${i}`} cx={x(sx)} cy={sy} r={dot} strokeWidth={small ? 3 : 1.5} />)}
        {!small && drawing.runs?.map(([[x1, y1], [x2, y2]], i) => (
          <path key={`r${i}`} d={`M${x(x1)} ${y1} ${x(x2)} ${y2}`} strokeWidth={1.5} strokeLinecap="round" />
        ))}
      </svg>
    </span>
  )
}

/** TRAK-268: a Play It Right match moment, on its part's colour: two speech bubbles for
 *  "make the call", a numbered list for "rank three". */
export function MomentArt({ colour, size = 48, rank = false }: { colour: string; size?: number; rank?: boolean }) {
  return (
    <span aria-hidden className="flex flex-none items-center justify-center rounded-[4px]" style={{ background: colour, width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke={ON_LIBRARY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {rank
          ? <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 5.5l1.2-.8V8M3.8 11.2a1.2 1.2 0 1 1 1.6 1.7L3.8 14.5h2.4M3.8 17h2.2l-1.2 1.4a1 1 0 1 1-1 1.6" strokeWidth={1.4} /></>
          : <><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h7A2.5 2.5 0 0 1 15 5.5v3A2.5 2.5 0 0 1 12.5 11H8l-3.5 3v-3A2.5 2.5 0 0 1 3 8.5z" /><path d="M18 9h.5A2.5 2.5 0 0 1 21 11.5v3a2.5 2.5 0 0 1-1.5 2.3V20l-3-2.5H13a2.5 2.5 0 0 1-2.5-2.5" /></>}
      </svg>
    </span>
  )
}

/** A six-week programme as a small stack of cards with "6 weeks" on the front. */
export function ProgrammeArt({ colour, size, label }: { colour: string; size: number; label?: string }) {
  const lip = Math.max(6, Math.round(size / 18))
  return (
    <span aria-hidden className="relative block flex-none" style={{ width: size, height: size + lip }}>
      <span className="absolute top-0 rounded-t-[4px]" style={{ left: lip, right: lip, height: lip * 2, background: colour, opacity: 0.45 }} />
      <span className="absolute left-0 flex flex-col"
        style={{
          top: lip, width: size, height: size, background: colour, color: ON_LIBRARY, borderRadius: size >= 120 ? 8 : 4,
          padding: size >= 120 ? size / 12 : 0, boxSizing: 'border-box',
          justifyContent: size >= 120 ? 'space-between' : 'center', alignItems: size >= 120 ? 'flex-start' : 'center',
        }}>
        {size >= 120 && label && <span className="font-semibold tracking-[0.1em] uppercase" style={{ fontSize: Math.max(11, size / 16) }}>{label}</span>}
        <span className={`flex ${size >= 120 ? 'items-baseline gap-2' : 'flex-col items-center'} leading-none`}>
          <span className="font-bold" style={{ fontSize: size >= 120 ? size * 0.34 : size * 0.38 }}>6</span>
          <span className="font-semibold tracking-[0.08em]" style={{ fontSize: size >= 120 ? size * 0.085 : Math.max(8, size * 0.17) }}>WEEKS</span>
        </span>
      </span>
    </span>
  )
}
