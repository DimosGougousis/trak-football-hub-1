/**
 * TRAK-189 (light theme): screens take colour from the role tokens (--t-* in
 * src/index.css, Tailwind's ink/surface/line/brand…), never a hex code or
 * white/black at N%. A hard-coded colour stays dark on a light page. This
 * fails on a new one, naming the file and line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
// Colour data and fixed artwork, each for a reason:
const ALLOWED = new Set([
  'lib/types.ts',                       // rating band colours (single source, band-single-source.test)
  'lib/coach-events.ts',                // event type colours (TRAK-159, event-colours-trak159.test)
  'lib/fixed-colours.ts',               // colours that don't follow the theme (WhatsApp green, Developing)
  'lib/card-export.ts',                 // the exported card image, drawn on a canvas
  'pages/player/PlayerEvolutionCard.tsx', // the player card's own artwork (parked)
  'pages/player/PlayerPassport.tsx',    // the passport's own artwork (parked)
  'components/trak/PitchDiagram.tsx',   // the pitch drawing
])
const SKIP_DIRS = ['__tests__', 'stories', 'components/ui', 'components/arc']

const COLOUR = [
  /#[0-9a-fA-F]{6}\b/,
  /['"`]#[0-9a-fA-F]{3}['"`]/,
  /rgba?\(\s*\d+\s*[, ]\s*\d+\s*[, ]\s*\d+/,   // any rgb()/rgba() written as numbers
  /(?<![\w-])(text|bg|border|ring|divide|outline|placeholder)-(white|black)(?![\w-])/,
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name), rel = relative(SRC, path)
    if (SKIP_DIRS.some(d => rel === d || rel.startsWith(d + '/'))) return []
    if (statSync(path).isDirectory()) return files(path)
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [rel] : []
  })
}

describe('TRAK-189: no hard-coded colours in screens', () => {
  it('every colour comes from a role token', () => {
    const found: string[] = []
    for (const rel of files(SRC)) {
      if (ALLOWED.has(rel)) continue
      readFileSync(join(SRC, rel), 'utf8').split('\n').forEach((line, i) => {
        // A shadow is a shadow in every theme.
        const withoutShadows = line.replace(/shadow-\[[^\]]*\]|boxShadow:\s*'[^']*'|textShadow:\s*'[^']*'/g, '')
        if (COLOUR.some(re => re.test(withoutShadows))) found.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`)
      })
    }
    expect(found).toEqual([])
  })
})
