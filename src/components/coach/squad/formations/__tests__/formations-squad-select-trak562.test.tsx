/**
 * TRAK-562 (phone review, 23 Nov): with "All squads" selected, Formations offers a squad dropdown in place of the empty
 * state. Selecting a squad picks it as the side menu does, so its formations open without going to the menu.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listOptions, pickOption } from '@/test/arc-select'
import { FormationsTab } from '@/components/coach/squad/formations/FormationsTab'
import type { SquadRoster } from '@/components/coach/squad/useSquadRoster'

const pick = vi.hoisted(() => vi.fn())
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'coach-a' } }) }))
vi.mock('@/lib/coach-squad', async importOriginal => ({ ...await importOriginal<object>(), useCoachSquad: () => ({ pick }) }))

const allSquads = { squad: null, squads: ['U14', 'U16'], players: [], consentPending: new Set() } as unknown as SquadRoster
afterEach(() => { cleanup(); pick.mockReset() })

describe('TRAK-562: Formations with All squads selected', () => {
  it('offers a squad dropdown, and selecting a squad picks it as the menu does', async () => {
    render(<MemoryRouter><FormationsTab roster={allSquads} /></MemoryRouter>)
    expect(screen.queryByText(/Choose a squad in the menu/)).not.toBeInTheDocument()
    expect(await listOptions('Squad')).toEqual(['U14', 'U16'])
    await pickOption('Squad', 'U16')
    expect(pick).toHaveBeenCalledWith('U16')
  })
})
