import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toInstant } from '@/lib/event-time'

/**
 * TRAK-168 (Imad, 17 Oct): when a coach cancels an upcoming event, the next
 * thing they do is tell the team group. So right after Cancel event saves, the
 * confirmation offers Share to WhatsApp with the cancellation message ready:
 * the event's link, the reason unless it names a child, nothing sent until the
 * coach picks a chat. Driven through the rendered Schedule and the real SDK.
 */

const COACH = { id: 'coach-1' }
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
// Tomorrow, so the event is upcoming whatever the time of day.
const day = (() => { const d = new Date(`${localTodayISO()}T12:00:00`); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA') })()

const LIVE = {
  id: 'live-1', coach_user_id: COACH.id, title: 'vs Synthetic Rovers', event_type: 'match', opponent: 'Synthetic Rovers',
  starts_at: toInstant(day, '18:30'), ends_at: null, event_date: day, start_time: '18:30:00', venue: 'Rovers Park',
  notes: null, published: true, source: 'manual', meet_time: null, kit: null, home_away: 'away',
  status: 'scheduled', cancel_reason: null, series_id: null,
}

let rows: Record<string, unknown>[]
let failCancel: boolean

beforeEach(() => {
  signInAs(COACH)
  rows = [LIVE]
  failCancel = false
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json(rows)),
    table('coach_sessions', []),
    // The squad label and its children's names, so a reason naming a child stays out.
    table('squad_players', [{ id: 'sq-1', age_group: 'U14', status: 'active', player_name: 'Ade Okafor' }]),
    rpc('feature_on', () => true),
    http.patch(EVENTS, async ({ request }) => {
      if (failCancel) return HttpResponse.json({ message: 'Synthetic failure' }, { status: 500 })
      const body = await request.json() as Record<string, unknown>
      rows = [{ ...LIVE, ...body }]
      return HttpResponse.json([{ id: 'live-1' }])
    }),
    http.post(`${SUPABASE_URL}/functions/v1/send-event-emails`, () => HttpResponse.json({ accepted: true }, { status: 202 })),
  )
})

async function cancelWith(reason: string) {
  renderApp('/coach/schedule')
  // Schedule opens on today; the event is tomorrow, so open it by its link.
  window.history.pushState({}, '', `/coach/schedule?cancel=${LIVE.id}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
  const sheet = await screen.findByRole('dialog', { name: 'Cancel event' })
  if (reason) await userEvent.type(within(sheet).getByLabelText('Reason (optional)'), reason)
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel event' }))
}

const shared = (link: HTMLElement) => decodeURIComponent(new URL(link.getAttribute('href')!).searchParams.get('text')!)

describe('TRAK-168: right after Cancel event, Share to WhatsApp', () => {
  it('offers the cancellation message, with its reason and the event link, and nothing is sent until a chat is picked', async () => {
    await cancelWith('Pitch waterlogged')
    const done = await screen.findByRole('dialog', { name: 'Event cancelled' })
    const link = within(done).getByRole('link', { name: 'Share' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/) // no number: WhatsApp asks which chat
    expect(link).toHaveAttribute('target', '_blank')
    const text = shared(link)
    expect(text).toContain('CANCELLED')
    expect(text).toContain('U14 Match vs Synthetic Rovers')
    expect(text).toContain('Pitch waterlogged')
    expect(text).not.toContain('Rovers Park') // the event is off; no venue (Imad, 18 Oct)
    expect(text).toContain(`https://trakfootball.com/event/${LIVE.id}`)
    await userEvent.click(within(done).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Event cancelled' })).toBeNull()
  })

  it('leaves out a reason that names a child', async () => {
    await cancelWith('Ade Okafor is ill')
    const link = within(await screen.findByRole('dialog', { name: 'Event cancelled' })).getByRole('link', { name: 'Share' })
    expect(shared(link)).not.toMatch(/Ade|Okafor|is ill|Reason/)
    expect(shared(link)).toContain('CANCELLED')
  })

  // TRAK-176: a coach with two squads; the message names the event's own squad,
  // as Schedule's Share does, not the coach's larger one.
  it("names the event's own squad", async () => {
    rows = [{ ...LIVE, squad: 'U16' }]
    server.use(table('squad_players', [
      { id: 'sq-1', age_group: 'U14', status: 'active', player_name: 'Ade Okafor' },
      { id: 'sq-2', age_group: 'U14', status: 'active', player_name: 'Ben Okoro' },
      { id: 'sq-3', age_group: 'U16', status: 'active', player_name: 'Cal Mensah' },
    ]))
    await cancelWith('')
    const link = within(await screen.findByRole('dialog', { name: 'Event cancelled' })).getByRole('link', { name: 'Share' })
    expect(shared(link).split('\n')[0]).toBe('*❌ CANCELLED | U16 Match vs Synthetic Rovers (Away)*')
  })

  it('offers nothing to share when the cancel fails', async () => {
    failCancel = true
    await cancelWith('Pitch waterlogged')
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't cancel the event")
    expect(screen.queryByRole('dialog', { name: 'Event cancelled' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Share' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Cancel event' })).toBeInTheDocument())
  })
})
