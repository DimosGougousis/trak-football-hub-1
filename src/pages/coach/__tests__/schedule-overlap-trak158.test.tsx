import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { saveEventWith } from '../../../../tests/support/event-steps'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toInstant } from '@/lib/event-time'

/**
 * TRAK-158 (J8.4): the database refuses a live event that overlaps another of
 * the coach's (supabase/tests/event_overlap.sql). Its refusal is a sentence
 * for the coach, naming the clash; the schedule shows it as it is, instead of
 * "Check your connection", wherever an event goes live or moves.
 */

const COACH = { id: 'coach-1' }
const today = localTodayISO()
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
const CLASH = 'This overlaps vs Palm United, 17:00–18:30. Change the time or cancel one.'
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const row = (over: Record<string, unknown>) => ({
  coach_user_id: COACH.id, event_type: 'training', starts_at: toInstant(today, '18:00'), ends_at: null,
  event_date: today, start_time: '18:00:00', end_time: '19:30:00', venue: 'Main Venue', opponent: null, notes: null,
  published: false, source: 'manual', meet_time: null, kit: null, home_away: null, status: 'scheduled',
  cancel_reason: null, series_id: null, ...over,
})
const DRAFT = row({ id: 'draft-1', title: 'Technical' })
const LIVE = row({ id: 'live-1', title: 'Fitness', published: true, start_time: '20:00:00', end_time: '21:00:00', starts_at: toInstant(today, '20:00') })
const SERIES = 'series-1'
const WEEK1 = row({ id: 'w1', title: 'Training', published: true, series_id: SERIES, start_time: '19:00:00', end_time: '20:00:00' })
const WEEK2 = row({ id: 'w2', title: 'Training', published: true, series_id: SERIES, start_time: '19:00:00', end_time: '20:00:00', event_date: shift(today, 7) })

/** Writes to these ids are refused as an overlap; the rest succeed. */
let clashing: string[]
function fixtures(rows: Record<string, unknown>[]) {
  clashing = []
  const refuseIfClashing = async ({ request }: { request: Request }) => {
    const search = decodeURIComponent(new URL(request.url).search)
    if (clashing.some(id => search.includes(id)) || (clashing.includes('*'))) {
      return HttpResponse.json({ code: 'P0001', message: CLASH, details: null, hint: null }, { status: 400 })
    }
    return HttpResponse.json([{ id: 'written' }])
  }
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Dora', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json(rows)),
    table('coach_sessions', []),
    table('squad_players', []),
    rpc('feature_on', () => true),
    http.patch(EVENTS, refuseIfClashing),
    http.post(`${SUPABASE_URL}/functions/v1/send-event-emails`, () => HttpResponse.json({ accepted: true }, { status: 202 })),
  )
}
const toastText = () => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.textContent ?? '').join(' | ')
async function open(title: string) {
  renderApp('/coach/schedule')
  await screen.findByText(title, { selector: 'p' })
  await waitFor(() => expect(screen.queryByRole('note', { name: 'This screen is coming soon' })).toBeNull())
}

describe('TRAK-158: an overlap is refused with the clash named', () => {
  beforeEach(() => signInAs(COACH))

  it('publishing a draft that overlaps says which event it clashes with', async () => {
    fixtures([DRAFT])
    clashing = ['draft-1']
    await open('Technical')
    await userEvent.click(screen.getByRole('button', { name: 'Publish Technical' }))
    await waitFor(() => expect(toastText()).toContain(CLASH))
    expect(toastText()).not.toMatch(/Try again/)
  }, 20_000)

  it('saving a published event into a clash keeps the form open and names the clash', async () => {
    fixtures([LIVE])
    clashing = ['live-1']
    await open('Fitness')
    await userEvent.click(screen.getByRole('button', { name: 'Edit Fitness' }))
    const sheet = screen.getByRole('dialog', { name: 'Edit event' })
    await saveEventWith(sheet, 'Save changes')
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(CLASH)
    expect(within(sheet).getByRole('alert')).not.toHaveTextContent(/connection/)
  }, 20_000)

  it('"this and following weeks": the weeks that clash are named, the rest save', async () => {
    fixtures([WEEK1, WEEK2])
    clashing = ['w2']
    await open('Training')
    await userEvent.click(screen.getByRole('button', { name: 'Edit Training' }))
    const sheet = screen.getByRole('dialog', { name: 'Edit event' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'This and following weeks' }))
    await saveEventWith(sheet, 'Save changes')
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(`Saved 1 of 2 weeks. ${CLASH}`)
  }, 20_000)

  it('publishing a series that clashes names the clash in the series sheet', async () => {
    const draftWeek = { ...WEEK1, published: false }
    fixtures([draftWeek, { ...WEEK2, published: false }])
    clashing = ['*']
    await open('Training')
    await userEvent.click(screen.getByRole('button', { name: 'Publish Training' }))
    const sheet = screen.getByRole('dialog', { name: 'Publish event' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'This and following weeks' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(CLASH)
  }, 20_000)
})
