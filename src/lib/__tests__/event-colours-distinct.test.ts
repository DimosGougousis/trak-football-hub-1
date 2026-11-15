import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CANCELLED_COLOR, EVENT_COLOR, NO_TIME_COLOR } from '../coach-events'

/**
 * TRAK-189 (Imad, 18 Oct: "match events move to purple"). On the light theme a
 * green match sat next to the brand green and read as a button. Each event
 * colour must stay readable on the light screens and stay told apart from every
 * other event colour and from the brand, also for the commonest colour
 * blindness (deuteranopia, Machado 2009), where purple and blue run together.
 */

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (rgb: number[]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(hex(a).map(lin)), luminance(hex(b).map(lin))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]
const lab = ([r, g, b]: number[]) => {
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883].map(f)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const seen = (h: string, deutan: boolean) => {
  const v = hex(h).map(lin)
  return deutan ? DEUTAN.map(row => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2]))) : v
}
const apart = (a: string, b: string, deutan = false) => {
  const [p, q] = [lab(seen(a, deutan)), lab(seen(b, deutan))]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

// The light theme's own values (src/index.css), so the check follows the theme.
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')
const token = (name: string) => {
  const [r, g, b] = css.match(new RegExp(`--t-${name}:\\s*(\\d+) (\\d+) (\\d+)`))!.slice(1).map(Number)
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`
}
const SCREENS = { surface: token('surface'), ground: token('ground') }

describe('event colours on the light theme (TRAK-189)', () => {
  // TRAK-271 (Tarek, 23 Oct): the permanent colours. Training and other were too alike (teal and olive).
  // TRAK-275 (Tarek, 23 Oct, later): a second set, one family (15 and C2), and needs you back to #EAB308.
  it('are the permanent colours', () => {
    expect(EVENT_COLOR).toEqual({ training: '#6EC215', match: '#6915C2', other: '#15C2BF', tournament: '#3B5BBD' })
    expect(CANCELLED_COLOR).toBe('#C21517')
    expect(token('attention')).toBe('#eab308')
  })

  // TRAK-271: training, other and needs you are bright (about 1.5:1 on white), so no event colour is ever
  // text: a type word stays dark beside its coloured dot, and a "Cancelled" word uses the danger token.
  // (Replaces TRAK-189/231's rule that every event colour reads as text at 4.5:1.)
  it('is never used as a text colour, on any screen', () => {
    const found: string[] = []
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? (e.name === '__tests__' ? [] : walk(join(dir, e.name))) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [])
    for (const file of walk(resolve(__dirname, '../..'))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // A calendar mark ({ color, hollow }) is a dot, not text.
        if (/\bcolor:\s*[^,}]*\b(TYPE_COLOR|EVENT_COLOR|CANCELLED_COLOR)\b/.test(line) && !/hollow:\s*true/.test(line)) found.push(`${file.split('/src/')[1]}:${i + 1}`)
      })
    }
    expect(found).toEqual([])
  })

  it('"No time set" (a warning, not a type) still reads as text (4.5:1)', () => {
    for (const [screen, background] of Object.entries(SCREENS)) {
      expect(contrast(NO_TIME_COLOR, background), `noTime on ${screen}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  // The four kinds and the brand. Cancelled red and No-time amber can't also be
  // told from orange by colour alone with deuteranopia (no orange that still
  // reads at 4.5:1 manages it), so those two carry words: "Cancelled",
  // "No time set". Cancelled dots also use a hollow ring (TRAK-189).
  it('every kind of event is told apart from the others and from the brand, also with deuteranopia', () => {
    const all = { ...EVENT_COLOR, brand: token('brand') }
    const names = Object.keys(all) as (keyof typeof all)[]
    for (const a of names) for (const b of names) {
      if (a >= b) continue
      expect(apart(all[a], all[b]), `${a} vs ${b}`).toBeGreaterThanOrEqual(10)
      expect(apart(all[a], all[b], true), `${a} vs ${b}, deuteranopia`).toBeGreaterThanOrEqual(10)
    }
  })
})
