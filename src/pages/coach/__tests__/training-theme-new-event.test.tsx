import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toInstant } from '@/lib/event-time'
import { pickTime } from '../../../../tests/support/arc-pickers'
import { eventStep, saveEventWith } from '../../../../tests/support/event-steps'

/**
 * [scope] Training theme on New event: setting up a training, the coach picks
 * its theme from the catalogue's seven libraries (radio buttons) and can open
 * the Coaching Session Catalogue on that theme to find sessions for it.
 */

const COACH = { id: 'coach-theme' }
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
const today = localTodayISO()
const SAVED = {
  id: 'ev-1', coach_user_id: COACH.id, title: 'Training', event_type: 'training', starts_at: toInstant(today, '23:00'),
  ends_at: null, event_date: today, start_time: '23:00:00', end_time: null, venue: null, opponent: null,
  notes: null, published: false, source: 'manual', meet_time: null, kit: null, home_away: null, status: 'scheduled',
  cancel_reason: null, series_id: null, training_theme: 'goalkeeping',
}

let posts: unknown[]
let patches: unknown[]
beforeEach(() => {
  signInAs(COACH)
  posts = []
  patches = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json([SAVED])),
    http.post(EVENTS, async ({ request }) => { posts.push(await request.json()); return HttpResponse.json([{ id: 'new-1' }], { status: 201 }) }),
    http.patch(EVENTS, async ({ request }) => { patches.push(await request.json()); return HttpResponse.json([{ id: 'ev-1' }]) }),
    table('coach_sessions', []),
    table('squad_players', []),
    table('session_attendance', []),
    table('event_absences', []),
    rpc('feature_on', () => true),
    rpc('coach_squad_player_consent_required', () => false),
  )
})
afterEach(() => { server.events.removeAllListeners() })

async function newEvent() {
  renderApp('/coach/schedule')
  await userEvent.click(await screen.findByRole('button', { name: 'Add event' }))
  return screen.getByRole('dialog', { name: 'New event' })
}

describe('Training theme on New event', { timeout: 30_000 }, () => {
  it('a training offers the seven themes as radio buttons, none picked', async () => {
    const sheet = await newEvent()
    const group = within(sheet).getByRole('radiogroup', { name: 'Theme' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(7)
    for (const name of ['Technical', 'Attacking', 'Defending', 'Transition', 'Goalkeeping', 'Physical & movement', 'Psychological & social']) {
      expect(within(group).getByRole('radio', { name: new RegExp(`^${name}`) })).not.toBeChecked()
    }
    expect(within(group).getByText('82 sessions · 4 topics')).toBeInTheDocument()
  })

  it('links to the catalogue, on the picked theme once there is one', async () => {
    const sheet = await newEvent()
    const link = () => within(sheet).getByRole('link', { name: /Trainings Catalogue/ })
    expect(link()).toHaveAttribute('href', '/coach/trainings')
    expect(link()).toHaveAttribute('target', '_blank')
    await userEvent.click(within(sheet).getByRole('radio', { name: /^Defending/ }))
    expect(link()).toHaveAttribute('href', '/coach/trainings?lib=Tactical+%E2%80%93+Defending')
  })

  it('a match or other event has no theme', async () => {
    const sheet = await newEvent()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Match' }))
    expect(within(sheet).queryByRole('radiogroup', { name: 'Theme' })).toBeNull()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Other' }))
    expect(within(sheet).queryByRole('radiogroup', { name: 'Theme' })).toBeNull()
  })

  it('saves the picked theme and shows it on Review', async () => {
    const sheet = await newEvent()
    await userEvent.click(within(sheet).getByRole('radio', { name: /^Transition/ }))
    await eventStep(sheet, 'When')
    await pickTime(userEvent, 'Start', '23:00')
    await eventStep(sheet, 'Review')
    expect(within(sheet).getByText('Theme').nextElementSibling).toHaveTextContent('Transition')
    await saveEventWith(sheet, 'Save draft')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual([expect.objectContaining({ event_type: 'training', training_theme: 'transition' })])
  })

  it('an edit opens with the saved theme picked', async () => {
    renderApp('/coach/schedule?edit=ev-1')
    const sheet = await screen.findByRole('dialog', { name: 'Edit event' })
    expect(within(sheet).getByRole('radio', { name: /^Goalkeeping/ })).toBeChecked()
  })
})
