/**
 * TRAK-182 (Imad's 6d/6g): the Squad tab as a directory built from Arc's free
 * parts: search by name or shirt number, age group and position filters, and
 * a player panel in a bottom sheet. Nothing the old list showed goes missing:
 * position, shirt, age group, the consent chip and the band stay on each row.
 */
import { it, expect, describe, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, SUPABASE_URL } from '../../../../tests/msw/supabase'

const COACH = { id: 'coach-182-squad' }

beforeEach(() => {
  localStorage.clear()
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', nationality: 'AE' }]),
    table('squad_players', [
      { id: 'sq-luka', coach_user_id: COACH.id, player_name: 'Luka Modric', position: 'Midfielder', shirt_number: 10, age_group: 'U14' },
      { id: 'sq-virgil', coach_user_id: COACH.id, player_name: 'Virgil van Dijk', position: 'Defender', shirt_number: 4, age_group: 'U16' },
      { id: 'sq-alisson', coach_user_id: COACH.id, player_name: 'Alisson Becker', position: 'Goalkeeper', shirt_number: 1, age_group: 'U16' },
    ]),
    table('coach_sessions', []),
    table('coach_assessments', [{ squad_player_id: 'sq-luka', coach_rating: 8, created_at: '2026-10-01T10:00:00Z' }]),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`, async ({ request }) => {
      const { p_squad_player_id: id } = await request.json() as { p_squad_player_id: string }
      return HttpResponse.json(id === 'sq-virgil')
    }),
  )
})

// Sorted: the mock ignores the query's order.
const names = () => screen.getAllByRole('listitem').map(li => li.querySelector('p')?.textContent).sort()

describe('TRAK-182: the Squad directory', () => {
  it('searches by name or shirt number and filters by squad and position', async () => {
    const user = userEvent.setup()
    renderApp('/coach/squad')
    // TRAK-176: two squads, so the first one shows until the coach picks the other.
    await screen.findByText('Luka Modric')
    expect(screen.getByText('U14 · 1 player')).toBeInTheDocument()
    expect(screen.getByText('Midfielder · #10 · U14')).toBeInTheDocument()
    await user.click(within(screen.getByRole('group', { name: 'Squad' })).getByRole('button', { name: 'U16' }))
    expect(names()).toEqual(['Alisson Becker', 'Virgil van Dijk'])

    await user.type(screen.getByRole('searchbox', { name: 'Search players' }), 'van')
    expect(names()).toEqual(['Virgil van Dijk'])
    await user.clear(screen.getByRole('searchbox', { name: 'Search players' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search players' }), '#1')
    expect(names()).toEqual(['Alisson Becker'])
    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    await user.click(within(screen.getByRole('group', { name: 'Position' })).getByRole('button', { name: 'GK' }))
    expect(names()).toEqual(['Alisson Becker'])

    await user.type(screen.getByRole('searchbox', { name: 'Search players' }), 'Luka')
    expect(screen.getByText('No players match that search.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    // Clearing the filters keeps the squad picked.
    expect(names()).toEqual(['Alisson Becker', 'Virgil van Dijk'])
  })

  it('opens a player panel; Assess goes to that player only when they can be assessed', async () => {
    const user = userEvent.setup()
    localStorage.setItem(`trak:coach-squad:${COACH.id}`, 'U16')
    renderApp('/coach/squad')
    await user.click(await screen.findByRole('button', { name: /Virgil van Dijk/ }))
    const waiting = await screen.findByRole('dialog', { name: 'Virgil van Dijk' })
    expect(await within(waiting).findByText(/Waiting for/)).toBeInTheDocument()
    expect(within(waiting).getByText('Not assessed yet')).toBeInTheDocument()
    expect(within(waiting).getByRole('button', { name: 'Assess' })).toBeDisabled()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(within(screen.getByRole('group', { name: 'Squad' })).getByRole('button', { name: 'U14' }))
    await user.click(await screen.findByRole('button', { name: /Luka Modric/ }))
    const ready = await screen.findByRole('dialog', { name: 'Luka Modric' })
    expect(within(ready).getByText('Ready to assess')).toBeInTheDocument()
    expect(within(ready).getByText(/Latest band/)).toBeInTheDocument()
    await user.click(within(ready).getByRole('button', { name: 'Assess' }))
    // Assess opens with that player chosen.
    const picker = await screen.findByRole('combobox', { name: 'Player' })
    await waitFor(() => expect(picker).toHaveValue('sq-luka'))
  })
})
