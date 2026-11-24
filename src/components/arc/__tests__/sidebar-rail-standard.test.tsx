/**
 * Design standard step 2 (TRAK-769): the laptop's side rail at the standard's sizes, 192 px open and 68 px folded,
 * with 44 px rows.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { House } from 'lucide-react'
import { RAIL_WIDTH, SidebarRail } from '../blocks/sidebar-rail/sidebar-rail'

const css = readFileSync(join(__dirname, '..', 'blocks', 'sidebar-rail', 'sidebar-rail.module.css'), 'utf8')
const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

let shellWidth = 1280
beforeEach(() => {
  shellWidth = 1280
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => shellWidth)
  localStorage.clear()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

export const Frame = ({ onWidth, foldKey }: { onWidth?: (width: number) => void; foldKey?: string }) =>
  <SidebarRail label="Rehearsal FC" title="Home" brand={{ name: 'Rehearsal FC', logo: null }} foldKey={foldKey}
    items={[{ id: 'home', label: 'Home', icon: House }]} footerItem={{ id: 'settings', label: 'Settings' }}
    profile={{ name: 'Coach Synthetic', avatar: null }} active="home" onSelect={() => {}} onWidthChange={onWidth}>
    <p>Page</p>
  </SidebarRail>

describe('the side rail at the standard sizes', () => {
  it('reports 192 px open and 68 px folded', async () => {
    const onWidth = vi.fn()
    render(<Frame onWidth={onWidth} />)
    expect(RAIL_WIDTH).toEqual({ open: 192, folded: 68 })
    expect(onWidth).toHaveBeenLastCalledWith(192)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onWidth).toHaveBeenLastCalledWith(68)
  })

  it('draws rows to the standard', () => {
    const item = rule('.item')
    expect(item).toMatch(/height:\s*44px/)
    expect(item).toMatch(/border-radius:\s*12px/)
    expect(item).toMatch(/font-size:\s*14px/)
    for (const scope of ['.shell', '.sheetLayer']) {
      const vars = rule(scope)
      expect([scope, vars]).toEqual([scope, expect.stringContaining('--rail: var(--surface-rail)')])
      expect([scope, vars]).toEqual([scope, expect.stringContaining('--row-active: color-mix(in oklab, var(--foreground) 8%, transparent)')])
      expect([scope, vars]).toEqual([scope, expect.stringContaining('--row-hover: color-mix(in oklab, var(--foreground) 5%, transparent)')])
    }
    const current = rule('.item[aria-current="page"]')
    expect(current).toMatch(/font-weight:\s*600/)
    expect(current).toMatch(/color:\s*var\(--foreground\)/)
  })

  it('draws 18 px icons', () => {
    render(<Frame />)
    const row = screen.getAllByRole('button', { name: 'Home' })[0]
    expect(row.querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  it('brand and profile rows are 64 px', () => {
    expect(rule('.brand')).toMatch(/height:\s*64px/)
    expect(rule('.profile')).toMatch(/height:\s*64px/)
  })

  it('Arc knows the rail colour', () => {
    expect(readFileSync(join(__dirname, '..', 'arc-theme.css'), 'utf8')).toContain('--surface-rail: rgb(var(--t-rail));')
  })
})
