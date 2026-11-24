/** Design standard step 2 (TRAK-769): the squad picker in the laptop rail is a compact pill, "U16 · 15", on one line. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TeamSwitcher } from '@/components/arc/team-switcher/team-switcher'
import { squadPill } from '@/components/coach/SquadSwitcher'

afterEach(cleanup)
const css = readFileSync(join(__dirname, '..', '..', 'arc', 'team-switcher', 'team-switcher.module.css'), 'utf8')

describe('the squad pill', () => {
  it('names the squad and its size on one line', () => {
    expect(squadPill('U16', 15)).toBe('U16 · 15')
    expect(squadPill('All squads', 41)).toBe('All squads · 41')
    expect(squadPill('U16', undefined)).toBe('U16')
  })

  it('the compact trigger shows the short line, not the two-line name and size', () => {
    render(<TeamSwitcher className="arc" size="compact" manage={false} value="u16" onSwitch={async () => {}}
      workspaces={[{ id: 'u16', name: 'U16', plan: '15 players', short: 'U16 · 15' }]} />)
    const trigger = screen.getByRole('button', { name: /U16/ })
    expect(trigger.getAttribute('data-size')).toBe('compact')
    expect(trigger.textContent).toContain('U16 · 15')
    expect(trigger.textContent).not.toContain('15 players')
  })

  it('is 44 px tall, truncates a long name and keeps its chevron', () => {
    const compact = css.match(/\.trigger\[data-size="compact"\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(compact).toMatch(/height:\s*44px/)
    expect(compact).toMatch(/grid-template-columns:\s*28px minmax\(0, 1fr\) 14px/)
    const line = css.match(/\.compactLine\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(line).toMatch(/text-overflow:\s*ellipsis/)
    expect(line).toMatch(/white-space:\s*nowrap/)
  })

  it("the parent's switcher is unchanged", () => {
    render(<TeamSwitcher className="arc" manage={false} value="a" onSwitch={async () => {}} workspaces={[{ id: 'a', name: 'Sam', plan: 'U12' }]} />)
    expect(screen.getByRole('button', { name: /Sam/ }).hasAttribute('data-size')).toBe(false)
  })
})
