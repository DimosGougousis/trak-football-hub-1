import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { eventStep } from '../../../../tests/support/event-steps'
import { pickTime } from '../../../../tests/support/arc-pickers'
import { openNewEvent } from '../../../../tests/support/schedule-actions'

/**
 * TRAK-543 (found live, 22 Nov): on a new event, "Team kits" took the side menu's squad,
 * not the one picked in step 1, so a coach setting up U14's kits saved them as U16's.
 */
const COACH = { id: 'coach-543' }
const KITS = `${SUPABASE_URL}/rest/v1/coach_team_kits`
const ROSTER = [
  { id: 'sp-14', coach_user_id: COACH.id, player_name: 'Ade Okafor', position: 'Midfielder', age_group: 'U14', status: 'active', linked_player_id: 'pl-14' },
  { id: 'sp-16', coach_user_id: COACH.id, player_name: 'Bo Lind', position: 'Defender', age_group: 'U16', status: 'active', linked_player_id: 'pl-16' },
]

let kitReads: (string | null)[]
let kitSaves: Record<string, unknown>[]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-22T08:00:00Z'))
  signInAs(COACH)
  localStorage.setItem(`trak:coach-squad:${COACH.id}`, 'U16') // the side menu's squad
  kitReads = []
  kitSaves = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, () => HttpResponse.json([])),
    table('squad_players', ROSTER),
    table('event_absences', []),
    rpc('feature_on', ({ p_feature }) => p_feature !== 'games'),
    http.get(KITS, ({ request }) => {
      kitReads.push(new URL(request.url).searchParams.get('squad'))
      return HttpResponse.json([]) // no kits yet
    }),
    http.post(KITS, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      kitSaves.push(body)
      return HttpResponse.json({ kits: body.kits })
    }),
  )
})
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

describe('TRAK-543: a new event\'s team kits belong to the squad picked in step 1', { timeout: 20_000 }, () => {
  it('names, reads and saves the picked squad, and follows a change of squad', async () => {
    renderApp('/coach/schedule')
    await openNewEvent()
    const sheet = screen.getByRole('dialog', { name: 'New event' })
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'Squad' })).getByRole('button', { name: 'U14' }))
    await eventStep(sheet, 'When')
    await pickTime(userEvent, 'Start', '17:30')
    await eventStep(sheet, 'For families')

    expect(await within(sheet).findByRole('heading', { name: 'Team kits · U14' })).toBeInTheDocument()
    // The field is mounted from step 1 (it keeps unsaved colors across Back), so the side menu's squad may be read first.
    await waitFor(() => expect(kitReads.at(-1)).toBe('eq.U14'))

    await userEvent.click(await within(sheet).findByRole('button', { name: 'Set up team kits' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save team kits' }))
    await waitFor(() => expect(kitSaves).toHaveLength(1))
    expect(kitSaves[0]).toMatchObject({ coach_user_id: COACH.id, squad: 'U14' })

    // Back to step 1, every squad: the kits are the whole roster's.
    await eventStep(sheet, 'What')
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'Squad' })).getByRole('button', { name: 'All squads' }))
    await eventStep(sheet, 'For families')
    expect(await within(sheet).findByRole('heading', { name: 'Team kits · Whole roster' })).toBeInTheDocument()
    await waitFor(() => expect(kitReads.at(-1)).toBe('eq.'))
  })
})
