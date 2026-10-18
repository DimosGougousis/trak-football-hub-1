import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'

/**
 * TRAK-200 (Imad, 18 Oct): a coach couldn't tell a draft from a published
 * assessment, or find a draft again. Home's "Assess players" becomes "Player
 * Assessments": a page with Assess player and the recent assessments as
 * swipe cards, each saying Draft or Published, with Publish (or Published)
 * on the card. Tapping a card opens its quick look: opponent, message,
 * private note. The player's profile shows its latest assessment the same way.
 */
const COACH = { id: 'coach-200' }
const scores = { work_rate: 6, tactical: 6, attitude: 9, technical: 6, physical: 8, coachability: 9 }
const DRAFT = { id: 'as-draft', coach_user_id: COACH.id, squad_player_id: 'sp-1', created_at: '2026-10-18T10:00:00Z',
  published_at: null, appearance: null, ...scores,
  squad_players: { player_name: 'Ade Okafor', age_group: null }, coach_sessions: { title: 'vs Synthetic Rovers', session_date: '2026-10-17' } }
const PUBLISHED = { ...DRAFT, id: 'as-pub', created_at: '2026-10-11T10:00:00Z', published_at: '2026-10-11T10:00:00Z',
  squad_player_id: 'sp-2', squad_players: { player_name: 'Bo Lind', age_group: null }, coach_sessions: { title: 'Finishing', session_date: '2026-10-10' } }

let patches: { table: string; body: Record<string, unknown> }[]

function serve(rows: Record<string, unknown>[] = [DRAFT, PUBLISHED]) {
  patches = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, team: 'U16s', coach_role: 'Head Coach' }]),
    table('squad_players', [
      { id: 'sp-1', coach_user_id: COACH.id, player_name: 'Ade Okafor', created_at: '2026-09-01T00:00:00Z' },
      { id: 'sp-2', coach_user_id: COACH.id, player_name: 'Bo Lind', created_at: '2026-09-01T00:00:00Z' },
    ]),
    http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, ({ request }) => {
      const player = new URL(request.url).searchParams.get('squad_player_id')?.replace('eq.', '')
      return HttpResponse.json(player ? rows.filter(r => r.squad_player_id === player) : rows)
    }),
    table('coach_shared_feedback', [{ assessment_id: 'as-draft', body: 'Great pressing, keep your shape', published_at: null }]),
    table('coach_assessment_notes', [{ assessment_id: 'as-draft', note: 'Needs to work on composure' }]),
    table('coach_sessions', []),
    table('session_attendance', []),
    table('coach_calendar_events', []),
    rpc('feature_on', () => true),
    rpc('coach_squad_player_consent_required', () => false),
    ...['coach_assessments', 'coach_shared_feedback'].map(name =>
      http.patch(`${SUPABASE_URL}/rest/v1/${name}`, async ({ request }) => {
        patches.push({ table: name, body: await request.json() as Record<string, unknown> })
        const id = new URL(request.url).searchParams.get(name === 'coach_assessments' ? 'id' : 'assessment_id')?.replace('eq.', '')
        return HttpResponse.json([name === 'coach_assessments' ? { id } : { assessment_id: id }])
      })),
  )
}

beforeEach(() => signInAs(COACH))
afterEach(() => cleanup())

describe('TRAK-200: Player Assessments', () => {
  it('Home\'s button is "Player Assessments" and opens the page', async () => {
    serve()
    renderApp('/coach/home')
    await userEvent.click(await screen.findByRole('button', { name: /Player Assessments/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/assessments'))
    expect(await screen.findByRole('heading', { name: 'Player Assessments' })).toBeInTheDocument()
  }, 20_000)

  it('offers Assess player, and labels each recent assessment Draft or Published', async () => {
    serve()
    renderApp('/coach/assessments')
    expect(await screen.findByRole('link', { name: 'Assess player' })).toHaveAttribute('href', '/coach/assess')
    const recent = await screen.findByRole('region', { name: 'Recent assessments' })
    const first = await within(recent).findByRole('article', { name: /Ade Okafor/ })
    expect(within(first).getByRole('heading', { name: 'Draft' })).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    const second = within(recent).getByRole('article', { name: /Bo Lind/ })
    expect(within(second).getByRole('heading', { name: 'Published' })).toBeInTheDocument()
  }, 20_000)

  it('Publish on a draft card publishes the bands and the message, and the card says Published', async () => {
    serve()
    renderApp('/coach/assessments')
    const card = await screen.findByRole('article', { name: /Ade Okafor/ })
    await userEvent.click(within(card).getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(patches).toEqual([
      { table: 'coach_assessments', body: { published_at: expect.any(String) } },
      { table: 'coach_shared_feedback', body: { published_at: expect.any(String) } },
    ]))
    expect(await within(card).findByRole('heading', { name: 'Published' })).toBeInTheDocument()
  }, 20_000)

  it('Unpublish, from a published card\'s menu, hides the bands and the message again', async () => {
    serve([{ ...DRAFT, published_at: '2026-10-18T11:00:00Z' }])
    renderApp('/coach/assessments')
    const card = await screen.findByRole('article', { name: /Ade Okafor/ })
    expect(within(card).getByRole('heading', { name: 'Published' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Published more actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Unpublish' }))
    await waitFor(() => expect(patches).toEqual([
      { table: 'coach_assessments', body: { published_at: null } },
      { table: 'coach_shared_feedback', body: { published_at: null } },
    ]))
    expect(await within(card).findByRole('heading', { name: 'Draft' })).toBeInTheDocument()
  }, 20_000)

  it("the player's profile shows the latest as a card; its quick look has the opponent, message and private note", async () => {
    serve()
    // The profile reads its player by id with maybeSingle; the mock returns every row given.
    server.use(table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Ade Okafor', created_at: '2026-09-01T00:00:00Z' }]))
    renderApp('/coach/player/sp-1')
    const card = await screen.findByRole('article', { name: /Draft/ })
    expect(within(card).queryByText('Needs to work on composure')).toBeNull()
    await userEvent.click(within(card).getByRole('button', { name: 'Draft' }))
    const look = await screen.findByRole('dialog')
    expect(within(look).getByText('vs Synthetic Rovers')).toBeInTheDocument()
    expect(within(look).getByText('Great pressing, keep your shape')).toBeInTheDocument()
    expect(within(look).getByText('Needs to work on composure')).toBeInTheDocument()
    expect(within(look).getByRole('button', { name: 'Close quick look' })).toBeInTheDocument()
  }, 20_000)
})
