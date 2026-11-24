/**
 * Design standard step 2 (TRAK-769): the laptop top bar's actions. The bell is a 44 px outlined square; "+ Create" is a
 * near-black main button, 44 px tall, as wide as its word at the weight it is drawn in (TRAK-406: Greek is wider).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', '..', '..')
const read = (file: string) => readFileSync(join(SRC, file), 'utf8')
const rule = (css: string, selector: string) =>
  css.match(new RegExp(`(?:^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

describe('the top bar actions follow the design standard', () => {
  it('the bell is a 44 px outlined square', () => {
    const trigger = rule(read('components/arc/notification-center/notification-center.module.css'), '.trigger')
    expect(trigger).toMatch(/width:\s*44px/)
    expect(trigger).toMatch(/height:\s*44px/)
    expect(trigger).toMatch(/border:\s*1px solid var\(--border\)/)
  })

  it('Create is a filled main button at the top', () => {
    const css = read('components/arc/action-morph/action-morph.module.css')
    const face = rule(css, '.root[data-anchor="top"] .fab')
    expect(face).toMatch(/background:\s*var\(--accent\)/)
    expect(face).toMatch(/color:\s*var\(--accent-foreground\)/)
    expect(face).toMatch(/font-weight:\s*600/)
  })

  it('reduced transparency keeps the closed Create filled', () => {
    const css = read('components/arc/action-morph/action-morph.module.css')
    expect(css).not.toContain('.root[data-anchor="top"] .shape { background: var(--surface);')
    expect(css).toContain('.root[data-anchor="top"]:not([data-view="fab"]) .shape')
  })

  it('Create is 44 px tall with a white plus, measured at its drawn weight', () => {
    const quickAdd = read('components/coach/QuickAdd.tsx')
    expect(quickAdd).toContain('{ width: topWidth, height: 44 }')
    expect(quickAdd).toMatch(/<Plus size=\{16\} strokeWidth=\{2\.2\} aria-hidden="true" className="text-on-brand" \/>\{t\('nav:create'\)\}/)
    expect(quickAdd).toContain('context.font = `600 15px ${style.fontFamily}`')
  })
})

describe('Create closes without a dark slab (step 2 review)', () => {
  it('fills the fab face, not the closing shape', () => {
    const css = read('components/arc/action-morph/action-morph.module.css')
    expect(rule(css, '.root[data-anchor="top"][data-view="fab"] .shape')).not.toMatch(/background:\s*var\(--accent\)/)
    const face = rule(css, '.root[data-anchor="top"] .fab')
    expect(face).toMatch(/background:\s*var\(--accent\)/)
    expect(face).toMatch(/color:\s*var\(--accent-foreground\)/)
  })
})
