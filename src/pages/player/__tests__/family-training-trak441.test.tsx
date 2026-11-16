/**
 * TRAK-441 slice 7: with the academy's family_look switch on, a player's training (and any event that isn't a match) is
 * the coach's page header, as a match is: the title, one line of day, time and venue, a badge when it's cancelled, then
 * the Logistics a match has (meet, kit, the coach's message to families, Can't make it from the consent age). No Game
 * plan or Evaluation tabs, and never the coach's training plan: the page doesn't even ask for it. Test people are named
 * after footballers.
 */
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows, SUPABASE_URL } from '../../../../tests/msw/supabase'

const phoneTZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'Asia/Dubai' })
afterAll(() => { process.env.TZ = phoneTZ })

let n = 0
let PLAYER = { id: 'charisteas-user' }
const TRAINING = {
  id: 't1', coach_user_id: 'coach-1', published: true, event_type: 'training', title: null, opponent: null, home_away: null,
  event_date: '2099-11-16', start_time: '18:30:00', starts_at: '2099-11-16T14:30:00Z', venue: 'Rehearsal Park',
  meet_time: '18:15:00', kit: 'Blue shirts', status: 'scheduled', cancel_reason: null, sequence: 0, family_note: 'Bring water.',
}
// The coach's own: his plan for the training, his notes, and the match plan and review copies. None is for this page.
const NOT_FOR_THIS_PAGE = ['training_plans', 'training_plan_practices', 'training_plan_drafts', 'training_notes',
  'game_for_family', 'game_for_player', 'game_lineup_for_players', 'game_review_for_family', 'game_review_for_player']
let asked: string[]

function setup({ look = true, event = TRAINING as Record<string, unknown>, age = 14 } = {}) {
  const profiles = [{ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Angelos Charisteas' }]
  server.use(
    rpc('family_feature_on', ({ p_feature }) => look && p_feature === 'family_look'),
    ...NOT_FOR_THIS_PAGE.map(name => http.get(`${SUPABASE_URL}/rest/v1/${name}`, ({ request }) => { asked.push(request.url); return HttpResponse.json([]) })),
    http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
      const wanted = new URL(request.url).searchParams.get('user_id') ?? ''
      const rows = profiles.filter(profile => wanted.includes(profile.user_id))
      return (request.headers.get('Accept') ?? '').includes('vnd.pgrst.object') ? HttpResponse.json(rows[0] ?? null) : HttpResponse.json(rows)
    }),
    table('matches', []), table('player_details', []), table('coach_assessments', []), table('recognition_awards', []),
    table('squad_players', [{ id: 'charisteas', coach_user_id: 'coach-1' }]),
    table('event_absences', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('family_training_history', () => []),
    rpcRows('child_events', [event]),
    rpc('my_consent_status', () => ({ required: false, age, consent_age: 15, threshold: 18, own_choice: null })),
  )
}

beforeEach(() => { localStorage.clear(); asked = []; PLAYER = { id: `charisteas-user-${++n}` }; signInAs(PLAYER) })
afterEach(() => cleanup())

describe('TRAK-441: a player\'s training in the coach\'s look', { timeout: 30_000 }, () => {
  it('the header says it once, Logistics follows with no tabs, and nothing of the coach\'s plan', async () => {
    setup()
    renderApp('/player/event/t1')
    // The trail is the new page's alone (the old one has a Back button), so the switch has answered.
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument()
    expect(screen.getByText('Mon 16 Nov')).toBeInTheDocument()
    expect(screen.getByText(/Starts 18:30/)).toBeInTheDocument()
    expect(screen.getByText('Rehearsal Park')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Matches')

    const rows = screen.getByRole('list', { name: 'Event details' })
    expect(rows).toHaveTextContent('Meet18:15')
    expect(rows).toHaveTextContent('KitBlue shirts')
    expect(rows).toHaveTextContent('NotesBring water.')
    // The venue is in the header, so not again here; and no tabs: a training has no game plan or evaluation.
    expect(rows).not.toHaveTextContent(/Date|Venue|Rehearsal Park/)
    expect(screen.queryByRole('tab', { name: /Logistics|Game plan|Evaluation/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/game plan|evaluation|only you/i)
    expect(screen.queryByRole('button', { name: /Can.t make it/ })).toBeNull()
    expect(asked).toEqual([])
  })

  it('a player at the consent age says Can\'t make it for himself', async () => {
    setup({ age: 15 })
    renderApp('/player/event/t1')
    expect(await screen.findByRole('button', { name: /Can.t make it/ })).toBeInTheDocument()
  })

  it('a cancelled training has the Cancelled badge and the coach\'s reason', async () => {
    setup({ event: { ...TRAINING, status: 'cancelled', cancel_reason: 'Pitch closed.' } })
    renderApp('/player/event/t1')
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Pitch closed.')).toBeInTheDocument()
  })

  it('an event that is neither a match nor a training gets the same page, under its own title', async () => {
    setup({ event: { ...TRAINING, id: 't1', event_type: 'other', title: 'Team meeting' } })
    renderApp('/player/event/t1')
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Team meeting')
    expect(screen.getByRole('heading', { level: 1, name: 'Team meeting' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Event details' })).toHaveTextContent('KitBlue shirts')
    expect(screen.getByRole('list', { name: 'Event details' })).not.toHaveTextContent('Venue')
    expect(screen.queryByRole('tab', { name: /Game plan|Evaluation/ })).toBeNull()
  })

  it('with the switch off the page stays as it was', async () => {
    setup({ look: false })
    renderApp('/player/event/t1')
    expect(await screen.findByRole('list', { name: 'Event details' })).toHaveTextContent('VenueRehearsal Park')
    expect(screen.queryByText(/Starts 18:30/)).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
  })
})
