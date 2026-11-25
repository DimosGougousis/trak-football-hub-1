/** Design standard step 2 (TRAK-769): the squad picker in the laptop rail is a compact pill, "U16 · 15", on one line. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TeamSwitcher } from '@/components/arc/team-switcher/team-switcher'

afterEach(cleanup)
const css = readFileSync(join(__dirname, '..', '..', 'arc', 'team-switcher', 'team-switcher.module.css'), 'utf8')

describe('the squad pill', () => {
  it('the compact trigger shows the short line, not the two-line name and size', () => {
    render(<TeamSwitcher className="arc" size="compact" manage={false} value="u16" onSwitch={async () => {}}
      workspaces={[{ id: 'u16', name: 'U16', plan: '15 players', count: 15 }]} />)
    const trigger = screen.getByRole('button', { name: /U16/ })
    expect(trigger.getAttribute('data-size')).toBe('compact')
    expect(trigger.textContent).toContain('U16 · 15')
    expect(trigger.textContent).not.toContain('15 players')
  })

  it('is 44 px tall, truncates a long name and keeps its chevron', () => {
    const compact = css.match(/\.trigger\[data-size="compact"\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(compact).toMatch(/height:\s*44px/)
    expect(compact).toMatch(/grid-template-columns:\s*28px minmax\(0, 1fr\) 16px/)
    const name = css.match(/\.pillName\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(name).toMatch(/text-overflow:\s*ellipsis/)
    expect(name).toMatch(/white-space:\s*nowrap/)
  })

  it("the parent's switcher is unchanged", () => {
    render(<TeamSwitcher className="arc" manage={false} value="a" onSwitch={async () => {}} workspaces={[{ id: 'a', name: 'Sam', plan: 'U12' }]} />)
    expect(screen.getByRole('button', { name: /Sam/ }).hasAttribute('data-size')).toBe(false)
  })
})

describe('the pill keeps its count (step 2 review)', () => {
  it('the name truncates, the count never does, at 14 px', () => {
    render(<TeamSwitcher className="arc" size="compact" manage={false} value="all" onSwitch={async () => {}}
      workspaces={[{ id: 'all', name: 'All squads', plan: '41 players', count: 41 }]} />)
    const trigger = screen.getByRole('button', { name: /All squads/ })
    expect(trigger.querySelector('[data-pill-name]')?.textContent).toBe('All squads')
    expect(trigger.querySelector('[data-pill-count]')?.textContent).toBe(' · 41')
    expect(css).toMatch(/\.compactLine\s*\{[^}]*font-size:\s*14px/)
    expect(css).toMatch(/\.pillCount\s*\{[^}]*flex:\s*none/)
  })

  it("the parent's child switcher is a compact pill too", () => {
    const family = readFileSync(join(__dirname, '..', '..', 'parent', 'ParentFamily.tsx'), 'utf8')
    expect(family).toMatch(/<TeamSwitcher[^>]*size="compact"/)
  })
})
