import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toInstant } from '@/lib/event-time'

/**
 * TRAK-139 (J8.16). "Share to WhatsApp" on a published or cancelled event:
 * WhatsApp's standard share link with the message pre-written. Trak sends
 * nothing; the coach picks the group. No child names, no absence list. A
 * draft has nothing to share. Driven through the rendered app.
 */

const COACH = { id: 'coach-1' }
const today = localTodayISO()
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`

const row = (over: Record<string, unknown>) => ({
  coach_user_id: COACH.id, event_type: 'training', starts_at: toInstant(today, '17:00'),
  ends_at: null, event_date: today, start_time: '17:00:00', venue: 'Academy Pitch 2', opponent: null,
  notes: 'Omar starts on the bench', published: false, source: 'manual', meet_time: null, kit: null, home_away: null,
  status: 'scheduled', cancel_reason: null, ...over,
})
const DRAFT = row({ id: 'draft-1', title: 'Finishing' })
const LIVE = row({
  id: 'live-1', title: 'vs Synthetic Rovers', event_type: 'match', opponent: 'Synthetic Rovers', home_away: 'away',
  starts_at: toInstant(today, '18:30'), start_time: '18:30:00', meet_time: '17:45:00', kit: 'White', venue: 'Rovers Park', published: true,
})
const CANCELLED = row({
  id: 'off-1', title: 'Training', published: true, status: 'cancelled', cancel_reason: 'Pitch closed',
  starts_at: toInstant(today, '19:30'), start_time: '19:30:00',
})
// Cancelled with no reason: the only place a note could stand in for one.
const CANCELLED_NO_REASON = row({
  id: 'off-2', title: 'Fitness', published: true, status: 'cancelled', cancel_reason: null,
  starts_at: toInstant(today, '20:30'), start_time: '20:30:00',
})
// Imad's #266 review: the coach's reason names a child on the squad.
const CANCELLED_NAMING_A_CHILD = row({
  id: 'off-3', title: 'Recovery', published: true, status: 'cancelled', cancel_reason: "Lucas's family away, too few players",
  starts_at: toInstant(today, '21:00'), start_time: '21:00:00',
})

const SQUAD = [
  { age_group: 'U15', player_name: 'Omar Haddad', status: 'active' }, { age_group: 'U15', player_name: 'Lucas Petit', status: 'active' },
  { age_group: 'U14', player_name: 'Zara Example', status: 'active' },
  // Two departed U14 rows: counted, they would make the label U14.
  { age_group: 'U14', player_name: 'Nadia Former', status: 'coach_departed' }, { age_group: 'U14', player_name: 'Rami Former', status: 'coach_departed' },
]

let eventsOn: boolean
function fixtures() {
  eventsOn = true
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json([DRAFT, LIVE, CANCELLED, CANCELLED_NO_REASON, CANCELLED_NAMING_A_CHILD])),
    table('coach_sessions', []),
    table('squad_players', SQUAD),
    rpc('feature_on', () => eventsOn),
  )
}

const shareLink = (title: string) => screen.queryByRole('link', { name: `Share ${title} to WhatsApp` })
const sharedText = (link: HTMLElement) => {
  const href = link.getAttribute('href') ?? ''
  expect(href.startsWith('https://wa.me/?text=')).toBe(true)
  return decodeURIComponent(href.slice('https://wa.me/?text='.length))
}

describe('J8.16: Share to WhatsApp on the coach schedule', () => {
  beforeEach(() => signInAs(COACH))

  it('pre-writes a published match for the group: squad, time, venue, meet time, kit', async () => {
    fixtures()
    renderApp('/coach/schedule')
    const link = await screen.findByRole('link', { name: 'Share vs Synthetic Rovers to WhatsApp' })
    await waitFor(() => expect(sharedText(link)).toMatch(/^\*⚔️ MATCH \| U15 Match vs Synthetic Rovers \(Away\)\*/))
    const text = sharedText(link)
        expect(text).toContain('Venue: Rovers Park')
    expect(text).toContain('⏰ Meet Time: 17:45 | Kick-off: 18:30')
    expect(text).toContain('Kit: White')
    // TRAK-168: the link opens this event, not Home.
    expect(text).toContain('🔗 Confirm availability: https://trakfootball.com/event/live-1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shares a cancellation with its reason', async () => {
    fixtures()
    renderApp('/coach/schedule')
    const link = await screen.findByRole('link', { name: 'Share Training to WhatsApp' })
    // The reason waits for the squad's names (the child-name check).
    await waitFor(() => expect(sharedText(link)).toContain('Reason: Pitch closed'))
    expect(sharedText(link)).toMatch(/^\*❌ CANCELLED \| U15 Training\*/)
  })

  it('offers nothing to share for a draft only the coach can see', async () => {
    fixtures()
    renderApp('/coach/schedule')
    await screen.findByRole('link', { name: 'Share vs Synthetic Rovers to WhatsApp' })
    expect(shareLink('Finishing')).toBeNull()
  })

  it('never puts a child\'s name or a coach note in the message', async () => {
    fixtures()
    renderApp('/coach/schedule')
    const link = await screen.findByRole('link', { name: 'Share vs Synthetic Rovers to WhatsApp' })
    await waitFor(() => expect(sharedText(link)).toMatch(/^\*⚔️ MATCH \| U15 /))
    for (const l of screen.getAllByRole('link', { name: /to WhatsApp$/ })) {
      expect(sharedText(l)).not.toMatch(/Omar|Lucas|Zara|bench/)
    }
  })

  it('leaves out a cancel reason that names a child on the squad, and still shares the cancellation', async () => {
    fixtures()
    renderApp('/coach/schedule')
    const link = await screen.findByRole('link', { name: 'Share Recovery to WhatsApp' })
    await waitFor(() => expect(sharedText(link)).toMatch(/^\*❌ CANCELLED \| U15 Training\*/))
    expect(sharedText(link)).not.toMatch(/Reason:|Lucas/)
  })

  it('leaves out every reason, and titles the squad "Squad", when the squad read fails', async () => {
    fixtures()
    server.use(http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () => HttpResponse.json({ message: 'Synthetic failure' }, { status: 500 })))
    renderApp('/coach/schedule')
    const link = await screen.findByRole('link', { name: 'Share Training to WhatsApp' })
    await waitFor(() => expect(sharedText(link)).toMatch(/^\*❌ CANCELLED \| Squad Training\*/))
    expect(sharedText(link)).not.toContain('Reason:')
  })

  it('says "Coming soon" instead of sharing while events are off for the academy', async () => {
    const OFF = { id: 'coach-off' }  // its own coach: the app's query cache is shared across this file
    signInAs(OFF)
    fixtures()
    eventsOn = false
    server.use(table('profiles', [{ id: 'p-off', user_id: OFF.id, role: 'coach', full_name: 'Coach Off', invite_code: 'EFGH' }]))
    renderApp('/coach/schedule')
    expect(await screen.findByRole('note', { name: 'This screen is coming soon' })).toBeInTheDocument()
    const button = await screen.findByRole('button', { name: 'Share vs Synthetic Rovers to WhatsApp' })
    expect(button).not.toHaveAttribute('href')
    await userEvent.click(button)
    expect(await screen.findByText('This will be available in a future update.')).toBeInTheDocument()
  })
})
