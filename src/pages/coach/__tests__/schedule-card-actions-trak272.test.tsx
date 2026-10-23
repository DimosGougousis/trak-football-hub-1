import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { toInstant } from '@/lib/event-time'

/**
 * TRAK-272 (Tarek, 23 Oct, on the live Schedule): the pencil, ban and share icons at the top right of
 * each event "look like drawings, they don't look clickable, they are too small, and they don't point
 * me into what I need to do next". Each card now has Arc's Button group of that event's actions, in
 * words, the next step first, with Cancel or Delete behind its menu. Tapping the card opens the same
 * event sheet coach Home's week opens. And Schedule has a Back on a phone.
 */

const COACH = { id: 'coach-1' }
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
const TODAY = '2026-10-22'

const row = (over: Record<string, unknown>) => ({
  coach_user_id: COACH.id, event_type: 'training', starts_at: toInstant(TODAY, '18:00'), ends_at: null,
  event_date: TODAY, start_time: '18:00:00', venue: 'Main pitch', opponent: null, notes: null,
  published: false, source: 'manual', meet_time: null, kit: null, home_away: null, status: 'scheduled',
  cancel_reason: null, series_id: null, ...over,
})
const DRAFT = row({ id: 'draft-1', title: 'Shooting' })
const LIVE = row({ id: 'live-1', title: 'vs AEK Athens U16', event_type: 'match', opponent: 'AEK Athens U16', published: true,
  starts_at: toInstant(TODAY, '16:00'), start_time: '16:00:00' })
const STARTED = row({ id: 'past-1', title: 'Recovery', published: true, event_date: '2026-10-21',
  starts_at: toInstant('2026-10-21', '10:00'), start_time: '10:00:00' })

function fixtures() {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json([DRAFT, LIVE, STARTED])),
    table('coach_sessions', []),
    table('squad_players', []),
    table('event_absences', []),
    rpc('feature_on', () => true),
  )
}

const group = (title: string) => screen.getByRole('group', { name: `Actions for ${title}` })
const names = (el: HTMLElement) => within(el).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent?.trim())

async function open() {
  renderApp('/coach/schedule')
  await screen.findByText('Shooting', { selector: 'p, button' })
}

describe('TRAK-272: each Schedule card has a button group of its actions', { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 22, 9, 0, 0))
    signInAs(COACH)
    fixtures()
  })
  afterEach(() => vi.useRealTimers())

  it('a draft: Publish first, then Edit; Delete is behind More', async () => {
    await open()
    const g = group('Shooting')
    expect(names(g)).toEqual(['Publish Shooting', 'Edit Shooting', 'More actions for Shooting'])
    expect(within(g).getByRole('button', { name: 'Publish Shooting' })).toHaveTextContent('Publish')
    // No loose icon buttons left at the card's corner.
    expect(screen.queryByRole('button', { name: 'Delete Shooting' })).toBeNull()
    await userEvent.click(within(g).getByRole('button', { name: 'More actions for Shooting' }))
    expect(await screen.findByRole('menuitem', { name: 'Delete draft' })).toBeInTheDocument()
  })

  it('a published event to come: Share, Edit; Cancel is behind More', async () => {
    await open()
    const g = group('vs AEK Athens U16')
    expect(names(g)).toEqual(['Share vs AEK Athens U16', 'Edit vs AEK Athens U16', 'More actions for vs AEK Athens U16'])
    expect(screen.queryByRole('button', { name: 'Cancel vs AEK Athens U16' })).toBeNull()
    await userEvent.click(within(g).getByRole('button', { name: 'More actions for vs AEK Athens U16' }))
    expect(await screen.findByRole('menuitem', { name: 'Cancel event' })).toBeInTheDocument()
  })

  it('a started training with no register: Take register is the next step, and it says Needs you', async () => {
    await open()
    await userEvent.click(document.querySelector('[data-present] [data-date="2026-10-21"]') as HTMLElement)
    const g = group('Recovery')
    expect(names(g)[0]).toBe('Take register for Recovery')
    expect(within(g.closest('div.rounded-\\[14px\\]') as HTMLElement).getByText('Needs you')).toBeInTheDocument()
  })

  it('tapping the card opens its event sheet, as on coach Home', async () => {
    await open()
    const card = group('Shooting').closest('div.rounded-\\[14px\\]') as HTMLElement
    await userEvent.click(within(card).getByText(/Main pitch/))
    expect(await screen.findByRole('dialog', { name: /Shooting/ })).toBeInTheDocument()
  })

  it('has a Back at the top on a phone, to coach Home when there is nowhere to go back to', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/home'))
  })
})
