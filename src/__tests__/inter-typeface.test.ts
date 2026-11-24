/**
 * Design standard step 1 (TRAK-768): Trak's typeface is Inter, served from our own site (the site allows fonts from our
 * origin only, and the users are children in the EU), with Greek, as the app ships in Greek.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
const SUBSETS = ['latin', 'latin-ext', 'greek']
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]).filter(face => /font-family:\s*'Inter'/.test(face))

describe('Inter, self-hosted', () => {
  it('ships the three subsets and the licence', () => {
    for (const subset of SUBSETS) expect([subset, existsSync(join(ROOT, 'public', 'fonts', `inter-normal-variable-${subset}.woff2`))]).toEqual([subset, true])
    expect(existsSync(join(ROOT, 'public', 'fonts', 'Inter-OFL.txt'))).toBe(true)
  })

  it('declares one variable face per subset', () => {
    expect(faces).toHaveLength(3)
    for (const subset of SUBSETS) {
      const face = faces.find(f => f.includes(`/fonts/inter-normal-variable-${subset}.woff2`))
      expect([subset, !!face]).toEqual([subset, true])
      expect(face).toMatch(/font-weight:\s*100 900/)
      expect(face).toMatch(/font-display:\s*swap/)
    }
  })

  it('covers Greek', () => {
    const greek = faces.find(f => f.includes('greek.woff2'))
    expect(greek).toMatch(/unicode-range:[^;]*U\+0370-0377/)
  })

  it('is the typeface everywhere', () => {
    expect(css).toMatch(/--t-font:\s*'Inter'/)
    expect(css).toMatch(/--t-font-mono:\s*'Inter'/)
  })

  it('loads nothing from Google', () => {
    for (const file of ['index.html', 'src/index.css', 'vercel.json'])
      expect([file, readFileSync(join(ROOT, file), 'utf8')]).not.toEqual([file, expect.stringMatching(/fonts\.(googleapis|gstatic)\.com/)])
  })
})
