/**
 * TRAK-67 (J4): the second use-case test logged a training dated 29 Sep on
 * 25 Sep; it landed in History with the whole squad marked present. J4 records
 * what happened, so a session or match cannot be dated after today (future
 * planning is the parked calendar, TRAK-25).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, insertInto, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, localParts } from '@/lib/event-time'

const COACH = { id: 'coach-1' }
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localParts(d.toISOString()).date }
const dateInput = () => screen.getByLabelText('Session date') as HTMLInputElement
// TRAK-182: the date sits on the log's first step; Next stays shut while it is in the future.
const next = () => screen.getByRole('button', { name: 'Next' })

beforeEach(() => {
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    table('squad_players', []),
    table('coach_sessions', []),
    insertInto('coach_sessions', body => ({ id: 'session-1', ...body })),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`, () => HttpResponse.json(false)),
  )
})

describe('J4: a session or match cannot be dated in the future', () => {
  // TRAK-157: the training log's date is Arc's picker, which won't offer a day after today.
  it('a training cannot be dated tomorrow, and today can', async () => {
    const user = userEvent.setup()
    renderApp('/coach/sessions/add')
    await user.click(await screen.findByRole('button', { name: /Technical/ }))
    await user.click(screen.getByRole('button', { name: /^Session date\b/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Session date calendar' })
    expect(dialog.querySelector(`[data-present] [data-date="${tomorrow()}"]`)).toBeDisabled()
    await user.click(dialog.querySelector(`[data-present] [data-date="${localTodayISO()}"]`) as HTMLElement)
    await waitFor(() => expect(next()).toBeEnabled())
  })

  it('a match dated tomorrow cannot be saved', async () => {
    const user = userEvent.setup()
    renderApp('/coach/sessions/quick')
    await user.type(await screen.findByPlaceholderText('Opponent name'), 'Olympiacos Youth')
    const [us, them] = screen.getAllByPlaceholderText('0')
    await user.type(us, '1'); await user.type(them, '0')
    await waitFor(() => expect(next()).toBeEnabled())
    expect(dateInput()).toHaveAttribute('max', localTodayISO())
    fireEvent.change(dateInput(), { target: { value: tomorrow() } })
    expect(await screen.findByText(/can't be dated in the future/)).toBeInTheDocument()
    expect(next()).toBeDisabled()
  })
})
