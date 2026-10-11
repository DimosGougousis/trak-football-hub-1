import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toAcademyInstant, toInstant } from '@/lib/event-time'

/**
 * TRAK-128 (J8.5). The coach enters a weekly training once, with an end date,
 * on one or more weekdays; each date is its own row under one series_id.
 * Editing, cancelling, publishing or deleting a week asks: only this week, or
 * this and following weeks. Driven through the rendered app and the real SDK.
 */

const COACH = { id: 'coach-1' }
const today = localTodayISO()
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`

const week = (id: string, offset: number, over: Record<string, unknown> = {}) => {
  const date = shift(today, offset)
  return {
    id, coach_user_id: COACH.id, title: 'Training', event_type: 'training', series_id: 'series-1',
    starts_at: toInstant(date, '18:00'), ends_at: null, event_date: date, start_time: '18:00:00',
    venue: 'Academy Pitch 2', opponent: null, notes: null, published: true, source: 'manual',
    meet_time: null, kit: null, home_away: null, status: 'scheduled', cancel_reason: null, ...over,
  }
}

type Write = { method: string; query: string; body: unknown }
let writes: Write[]
let rows: Record<string, unknown>[]
let emailNudges: number

function fixtures() {
  writes = []
  emailNudges = 0
  // Last week, this week (today), and two more; the one after next is cancelled.
  rows = [week('w0', -7), week('w1', 0), week('w2', 7, { status: 'cancelled' }), week('w3', 14)]
  const write = (method: string) => async ({ request }: { request: Request }) => {
    const body = method === 'delete' ? null : await request.json()
    writes.push({ method, query: decodeURIComponent(new URL(request.url).search), body })
    const n = Array.isArray(body) ? body.length : 1
    return HttpResponse.json(Array.from({ length: n }, (_, i) => ({ id: `written-${i}` })), { status: method === 'post' ? 201 : 200 })
  }
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json(rows)),
    table('coach_sessions', []),
    rpc('feature_on', () => true),
    http.post(EVENTS, write('post')),
    http.patch(EVENTS, write('patch')),
    http.delete(EVENTS, write('delete')),
    // TRAK-135: the app asks the server to send queued family emails.
    http.post(`${SUPABASE_URL}/functions/v1/send-event-emails`, () => {
      emailNudges++
      return HttpResponse.json({ accepted: true }, { status: 202 })
    }),
  )
}

async function open() {
  renderApp('/coach/schedule')
  await screen.findByText('Training')
  await waitFor(() => expect(screen.queryByRole('note', { name: 'This screen is coming soon' })).toBeNull())
}

describe('J8.5: a weekly training series', () => {
  afterEach(() => { server.events.removeAllListeners() })
  beforeEach(() => {
    signInAs(COACH)
    fixtures()
  })

  it('creates 8 weeks of Monday and Wednesday training in one save: 16 drafts, one series', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
    const sheet = screen.getByRole('dialog', { name: 'New event' })
    // 7 Jan 2030 is a Monday; 27 Feb 2030 the Wednesday eight weeks on.
    const date = within(sheet).getByLabelText('Date')
    await userEvent.clear(date)
    await userEvent.type(date, '2030-01-07')
    await userEvent.type(within(sheet).getByLabelText('Start'), '18:00')
    await userEvent.type(within(sheet).getByLabelText('Venue'), 'Academy Pitch 2')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Repeats weekly' }))
    const days = within(sheet).getByRole('group', { name: 'Repeat on' })
    expect(within(days).getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(days).getByRole('button', { name: 'Wed' }))
    await userEvent.type(within(sheet).getByLabelText('Ends on'), '2030-02-27')
    expect(within(sheet).getByText(/^16 events, last one Wednesday 27 February/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save 16 drafts' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    const inserted = writes[0].body as Record<string, unknown>[]
    expect(writes[0].method).toBe('post')
    expect(inserted).toHaveLength(16)
    expect(new Set(inserted.map(r => r.series_id)).size).toBe(1)
    expect(inserted[0].series_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(inserted.map(r => r.event_date).slice(0, 3)).toEqual(['2030-01-07', '2030-01-09', '2030-01-14'])
    expect(inserted.at(-1)).toMatchObject({ event_date: '2030-02-27', starts_at: toAcademyInstant('2030-02-27', '18:00') })
    expect(inserted.every(r => r.published === false && r.start_time === '18:00:00' && r.venue === 'Academy Pitch 2')).toBe(true)
    expect(await screen.findByText(/Saved 16 events as drafts/)).toBeInTheDocument()
  })

  // Imad's #263 review: the repeat controls hide for a match, but hiding them
  // didn't switch the repeat off, so Save wrote a series of identical matches.
  it('switching a repeating training to a match saves one match, never a series', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
    const sheet = screen.getByRole('dialog', { name: 'New event' })
    const date = within(sheet).getByLabelText('Date')
    await userEvent.clear(date)
    await userEvent.type(date, '2030-01-07')
    await userEvent.type(within(sheet).getByLabelText('Start'), '18:00')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Repeats weekly' }))
    await userEvent.type(within(sheet).getByLabelText('Ends on'), '2030-02-27')
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'Event type' })).getByRole('button', { name: 'Match' }))
    await userEvent.type(within(sheet).getByLabelText('Opponent'), 'Synthetic Rovers')
    expect(within(sheet).queryByRole('button', { name: /^Save \d+ drafts$/ })).toBeNull()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    const inserted = writes[0].body as Record<string, unknown>[]
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ event_type: 'match', event_date: '2030-01-07', opponent: 'Synthetic Rovers' })
    expect(inserted[0].series_id ?? null).toBeNull()
  })

  it("won't save a series that ends before it starts, and says so", async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
    const sheet = screen.getByRole('dialog', { name: 'New event' })
    await userEvent.type(within(sheet).getByLabelText('Start'), '18:00')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Repeats weekly' }))
    await userEvent.type(within(sheet).getByLabelText('Ends on'), shift(today, -1))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save draft' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('The series has to end on or after its first date')
    expect(writes).toEqual([])
  })

  it('moves this and following weeks to 18:30; each keeps its date, and cancelled and past weeks stay', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Training' }))
    const sheet = screen.getByRole('dialog', { name: 'Edit event' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'This and following weeks' }))
    expect(within(sheet).getByLabelText('Date')).toBeDisabled()
    const start = within(sheet).getByLabelText('Start')
    await userEvent.clear(start)
    await userEvent.type(start, '18:30')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes).toHaveLength(2))
    const byId = Object.fromEntries(writes.map(w => [w.query.match(/id=eq\.(\w+)/)![1], w.body as Record<string, unknown>]))
    expect(Object.keys(byId).sort()).toEqual(['w1', 'w3'])   // not last week, not the cancelled week
    expect(byId.w1).toMatchObject({ event_date: today, start_time: '18:30:00', starts_at: toAcademyInstant(today, '18:30') })
    expect(byId.w3).toMatchObject({ event_date: shift(today, 14), start_time: '18:30:00' })
    expect(await screen.findByText('Saved 2 weeks. Families see the change.')).toBeInTheDocument()
    // TRAK-135: published weeks changed, so queued family emails are sent.
    expect(emailNudges).toBe(1)
  })

  it('says how many weeks saved when one of "this and following" fails, never "Saved" for all', async () => {
    // One week's update fails (connection, or RLS answering no row): the coach
    // must be told, or that week silently keeps the old time.
    server.use(http.patch(EVENTS, ({ request }) =>
      new URL(request.url).search.includes('w3')
        ? HttpResponse.json({ message: 'Synthetic failure' }, { status: 500 })
        : HttpResponse.json([{ id: 'written-0' }])))
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Training' }))
    const sheet = screen.getByRole('dialog', { name: 'Edit event' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'This and following weeks' }))
    const start = within(sheet).getByLabelText('Start')
    await userEvent.clear(start)
    await userEvent.type(start, '18:30')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))

    expect(await within(sheet).findByText(/Saved 1 of 2 weeks/)).toBeInTheDocument()
    expect(screen.queryByText(/Saved 2 weeks/)).not.toBeInTheDocument()
  })

  it('cancels only this week, or this and following weeks', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Training' }))
    let sheet = screen.getByRole('dialog', { name: 'Cancel event' })
    expect(within(sheet).getByRole('button', { name: 'Only this week' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel event' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ method: 'patch', query: '?id=eq.w1&select=id', body: { status: 'cancelled' } })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Training' }))
    sheet = screen.getByRole('dialog', { name: 'Cancel event' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'This and following weeks' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel event' }))
    // Imad's #263 review: only published weeks are cancelled. Unpublished
    // drafts in the range are deleted, never left cancelled and undeletable.
    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes[1]).toMatchObject({
      method: 'patch',
      query: `?series_id=eq.series-1&event_date=gte.${today}&status=eq.scheduled&published=eq.true&select=id`,
      body: { status: 'cancelled' },
    })
    expect(writes[2]).toMatchObject({
      method: 'delete',
      query: `?series_id=eq.series-1&event_date=gte.${today}&published=eq.false&status=eq.scheduled&select=id`,
    })
    // TRAK-135: each cancel asks for the families' email; the series is one email per person.
    await waitFor(() => expect(emailNudges).toBe(2))
  })

  it('publishes this and following draft weeks in one go', async () => {
    rows = rows.map(r => ({ ...r, published: false }))
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Publish Training' }))
    const sheet = screen.getByRole('dialog', { name: 'Publish event' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'This and following weeks' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'patch',
      query: `?series_id=eq.series-1&event_date=gte.${today}&published=eq.false&status=eq.scheduled&select=id`,
      body: { published: true },
    })
  })

  it('deletes only this draft week, never a published one', async () => {
    rows = rows.map(r => ({ ...r, published: false }))
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Training' }))
    const sheet = screen.getByRole('dialog', { name: 'Delete draft' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Only this week' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ method: 'delete', query: '?id=eq.w1&select=id' })
  })

  it('marks a series week as Weekly on its card', async () => {
    await open()
    expect(screen.getByText(/Training · Weekly · 18:00/)).toBeInTheDocument()
  })
})
