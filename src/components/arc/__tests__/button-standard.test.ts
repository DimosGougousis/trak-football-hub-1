/** Design standard step 1 (TRAK-768): Arc's buttons in the standard's weight, and an outlined button's edge darkens on hover. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '..', 'button', 'button.module.css'), 'utf8')
const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

describe('Arc buttons follow the design standard', () => {
  it('sets button text semibold', () => {
    expect(rule('.button')).toMatch(/font-weight:\s*600/)
  })
  it("darkens an outlined button's edge on hover", () => {
    expect(rule('.secondary:hover:not(:disabled)')).toMatch(/border-color:\s*var\(--border-strong\)/)
  })
  it('keeps the plain button hover fill', () => {
    expect(rule('.ghost:hover:not(:disabled)')).toMatch(/background:\s*var\(--surface-muted\)/)
  })
})
