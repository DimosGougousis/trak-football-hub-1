/**
 * Design standard step 3: Squad › Formations on the standard's pieces. The saved list sits under a "Saved formations"
 * label with New beside it; the formation in view is a card titled with its name, its saved state a pill in a live
 * region, Delete and Set for matchday in the card's footer.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FormationsTab } from '@/components/coach/squad/formations/FormationsTab'
import type { SquadRoster } from '@/components/coach/squad/useSquadRoster'
import type { Formation } from '@/components/coach/squad/formations/useFormations'

const state = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'coach-a' } }) }))
vi.mock('@/lib/coach-squad', async importOriginal => ({ ...await importOriginal<object>(), useCoachSquad: () => ({ pick: vi.fn() }) }))
vi.mock('@/components/coach/squad/usePlayerRoles', async importOriginal => ({
  ...await importOriginal<object>(),
  usePlayerRoles: () => ({ of: () => ({ also: [], roles: [] }), isPending: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/components/coach/squad/formations/useFormations', async importOriginal => {
  const write = () => ({ mutate: vi.fn(), isPending: false })
  return {
    ...await importOriginal<object>(),
    useFormations: () => ({ data: state.list, isError: false, refetch: vi.fn() }),
    useFormationWrites: () => ({ save: write(), start: write(), use: write(), undoCopy: write(), setDefault: write(), remove: write() }),
    refusal: () => null,
  }
})

const formation = (extra: Partial<Formation> = {}): Formation =>
  ({ id: 'f1', name: 'Saturday 4-3-3', format: 11, shape: '4-3-3', starters: {}, isDefault: false, copies: [], ...extra })
const player = (id: string, name: string, position: string | null, shirt: number) =>
  ({ id, player_name: name, position, shirt_number: shirt, age_group: 'U16' })
export const rosterOf = (players: ReturnType<typeof player>[]) =>
  ({ squad: 'U16', squads: ['U16'], players, consentPending: new Set<string>(), assessments: [] }) as unknown as SquadRoster
const PLACED = [player('p1', 'Kai Synthetic', 'Attacker', 9), player('p2', 'Noah Synthetic', 'Goalkeeper', 1)]

const show = (list: Formation[], players = PLACED) => {
  state.list = list
  return render(<MemoryRouter><FormationsTab roster={rosterOf(players)} /></MemoryRouter>)
}
beforeEach(() => { state.list = [] })
afterEach(cleanup)

describe('Formations on the design standard', () => {
  it('the saved list sits under a "Saved formations" label with New on its right', () => {
    show([formation()])
    const label = screen.getByRole('heading', { level: 2, name: 'Saved formations' })
    expect(label.parentElement?.querySelector('button')?.textContent).toContain('New formation')
    expect(screen.queryByRole('heading', { name: 'Your matchday playbook' })).toBeNull()
  })

  it('the formation in view is a card titled with its name', () => {
    show([formation()])
    const card = screen.getByRole('region', { name: 'Saturday 4-3-3' })
    expect(within(card).getByRole('heading', { level: 3, name: 'Saturday 4-3-3' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Rename formation' })).toBeInTheDocument()
  })

  it('its saved state is a pill in a live region', () => {
    show([formation()])
    const statuses = within(screen.getByRole('region', { name: 'Saturday 4-3-3' })).getAllByRole('status')
    const saved = statuses.find(status => status.textContent?.includes('All changes saved'))
    expect(saved?.querySelector('.text-success')).not.toBeNull()
  })

  it("Delete and Set for matchday sit in the card's footer", () => {
    show([formation({ copies: [{ eventId: 'e1', copiedAt: '2026-11-20T10:00:00Z', label: 'vs Rovers', notComing: 0, skipped: 0 }] })])
    const card = screen.getByRole('region', { name: 'Saturday 4-3-3' })
    const footer = card.querySelector('.border-line-soft') as HTMLElement
    expect(footer).not.toBeNull()
    expect(within(footer).getByRole('button', { name: 'Delete formation' })).toBeInTheDocument()
    expect(within(footer).getByRole('heading', { name: 'Set for matchday' })).toBeInTheDocument()
  })

  it('the default badge is a neutral pill', () => {
    show([formation({ isDefault: true })])
    const badge = screen.getByText('Default for 11 a side')
    expect(badge.closest('.bg-raised')).not.toBeNull()
  })
})

describe('locked Formations shows how many are placed', () => {
  const unplaced = (id: string, name: string, shirt: number) => player(id, name, null, shirt)

  it('a squad with players to place shows how many are placed', () => {
    show([], [...PLACED, unplaced('p3', 'Liam Synthetic', 10)])
    const card = screen.getByRole('region', { name: 'Place 1 player to open Formations' })
    expect(within(card).getByText('2 / 3')).toBeInTheDocument()
    expect(within(card).getByText('players placed')).toBeInTheDocument()
    const bar = within(card).getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('67')
    expect((bar.firstElementChild as HTMLElement).className).toContain('bg-attention')
    expect(within(card).getByRole('button', { name: 'Go to Positions' })).toBeInTheDocument()
  })

  it('nobody placed reads 0 / N with an empty bar', () => {
    show([], [unplaced('p3', 'Liam Synthetic', 10), unplaced('p4', 'Owen Synthetic', 5), unplaced('p5', 'Ada Synthetic', 8)])
    expect(screen.getByText('0 / 3')).toBeInTheDocument()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
  })

  it('everyone placed opens Formations', () => {
    show([formation()])
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Saved formations' })).toBeInTheDocument()
  })

  it('Greek has the caption', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const el = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'locales', 'el', 'coachSquad.json'), 'utf8'))
    expect(el.fmPlacedCaption).toBeTruthy()
  })
})

describe('heading order (step 3 review)', () => {
  it("the locked card's title is the page's next heading, an h2", () => {
    show([], [...PLACED, player('p3', 'Liam Synthetic', null, 10)])
    expect(screen.getByRole('heading', { level: 2, name: 'Place 1 player to open Formations' })).toBeInTheDocument()
  })
})
