/**
 * Design standard step 1 (docs/superpowers/specs/2026-11-24-trak-design-standard-design.md, section 1): the role
 * tokens carry the mockup's palette, every text colour still reads on white, and Arc keeps the meaning of info and
 * the player's chart series now that the brand colour is near-black.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
const root = css.match(/:root\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? ''
const tokens = Object.fromEntries([...root.matchAll(/--t-([\w-]+):\s*(\d+ \d+ \d+);/g)].map(m => [m[1], m[2]]))

const EXPECTED = {
  ground: '255 255 255', surface: '255 255 255', raised: '241 245 249', rail: '250 250 250',
  ink: '15 23 42', 'ink-2': '71 85 105', 'ink-3': '94 110 133',
  line: '203 213 225', 'line-soft': '241 245 249', 'line-strong': '100 116 139',
  brand: '15 23 42', 'on-brand': '255 255 255',
  success: '4 120 87', pitch: '5 150 105', warning: '146 64 14', attention: '234 179 8',
  info: '29 78 216', danger: '185 28 28',
}

const luminance = (rgb: string) => {
  const [r, g, b] = rgb.split(' ').map(Number).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('design standard: palette tokens', () => {
  it('sets each role token to the standard value', () => {
    for (const [name, value] of Object.entries(EXPECTED)) expect([name, tokens[name]]).toEqual([name, value])
  })

  it('meets contrast', () => {
    for (const text of ['ink', 'ink-2', 'ink-3', 'success', 'warning', 'info', 'danger'])
      expect([text, contrast(tokens[text], tokens.surface) >= 4.5]).toEqual([text, true])
    expect(contrast(tokens['ink-3'], tokens.raised)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens['line-strong'], tokens.surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(tokens['on-brand'], tokens.brand)).toBeGreaterThanOrEqual(4.5)
  })

  it("a coach's laptop labels are one slate step darker (TRAK-254)", () => {
    expect(css).toContain(':root[data-layout="coach"] { --t-ink-3: 71 85 105; }')
  })

  it('Tailwind knows the new tokens', () => {
    const config = readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf8')
    for (const name of ['rail', 'line-soft', 'pitch', 'attention'])
      expect(config).toContain(`"${name}": "rgb(var(--t-${name}) / <alpha-value>)"`)
  })

  it('Arc keeps meaning', () => {
    const arc = readFileSync(join(ROOT, 'src', 'components', 'arc', 'arc-theme.css'), 'utf8')
    expect(arc).toContain('--info: rgb(var(--t-info))')
    expect(arc).toContain('--series-1: rgb(var(--t-success))')
    expect(arc).toContain('--control-height-sm: 2.75rem')
  })
})
