/**
 * TRAK-199 (tablet and laptop, coach only): every coach screen takes its width
 * from one setting in src/index.css (--page-w, --read-w, --sheet-w, --rail-w;
 * .trak-page, .trak-read, .trak-page-bar and Tailwind max-w-sheet). A 430 px
 * written into a coach screen keeps it a phone column on an iPad or a laptop:
 * this fails on a new one, naming the file and line. The wider values apply
 * only to a signed-in coach (html[data-layout="coach"]) on a screen at least
 * 500 px tall, so players, parents and every phone, upright or sideways, keep
 * today's layout.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
// Not on a coach's screen in the pilot: parked, or no longer routed.
const NOT_SHOWN = new Set([
  'pages/coach/CoachAssistant.tsx',      // parked
  'pages/coach/CoachRecognition.tsx',    // parked
  'pages/coach/CoachReviewFeedback.tsx', // parked
  'pages/coach/CoachQuickMatchLog.tsx',  // unrouted (App.tsx)
  'components/coach/CoachHome.tsx',      // imported only by the unused CoachSessions.tsx
])
// Shared with players and parents; a coach sees them too.
const SHARED = ['components/trak/MobileShell.tsx', 'components/trak/NavBar.tsx', 'pages/Settings.tsx']
const coachFiles = ['pages/coach', 'components/coach'].flatMap(dir =>
  readdirSync(join(SRC, dir)).filter(name => name.endsWith('.tsx')).map(name => `${dir}/${name}`))

describe('TRAK-199: coach screens take their width from one setting', () => {
  it('no coach screen writes the phone width (430 px) itself', () => {
    const found = [...coachFiles, ...SHARED].filter(rel => !NOT_SHOWN.has(rel)).flatMap(rel =>
      readFileSync(join(SRC, rel), 'utf8').split('\n')
        .map((line, i) => /\b430px\b|max-w-\[430px\]/.test(line) ? `${rel}:${i + 1}: ${line.trim()}` : null)
        .filter((hit): hit is string => hit !== null))
    expect(found).toEqual([])
  })

  it('is a phone column for everyone, and wider only for a coach on a tablet or a laptop', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    for (const setting of ['--page-w: 430px;', '--read-w: 430px;', '--sheet-w: 430px;', '--rail-w: 0px;']) expect(css).toContain(setting)

    const wider = [...css.matchAll(/--(?:page|read|sheet|rail)-w:\s*([^;]+);/g)].filter(m => !['430px', '0px'].includes(m[1].trim()))
    expect(wider.length).toBeGreaterThan(0)
    for (const setting of wider) {
      // The rule it sits in, and the media query around that rule.
      const before = css.slice(0, setting.index)
      const open = before.lastIndexOf('{')
      const start = Math.max(before.lastIndexOf('{', open - 1), before.lastIndexOf('}', open - 1)) + 1
      const selector = before.slice(start, open).trim()
      const media = before.slice(before.lastIndexOf('}', start - 1) + 1, start)
      expect(`${setting[0]} in ${selector}`).toBe(`${setting[0]} in :root[data-layout="coach"]`)
      expect(media).toMatch(/@media \(min-width: (768|1024)px\) and \(min-height: 500px\)/)
    }
  })
})
