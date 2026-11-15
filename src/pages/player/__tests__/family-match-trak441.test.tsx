/**
 * TRAK-441 slice 3.3 (Imad, 12 Nov): with the academy's family_look switch on, a player's match page is the coach's
 * match header with three tabs: Logistics, Game plan, Evaluation. The header says the match once (who, day, kick-off,
 * venue) with a badge: "You start" before the match, the result after it. "New" marks the tab he hasn't opened. Before
 * the match the page never says what the coach expected of him. Test people are named after footballers.
 */
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows, SUPABASE_URL } from '../../../../tests/msw/supabase'

const phoneTZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'Asia/Dubai' })
afterAll(() => { process.env.TZ = phoneTZ })

let n = 0
let PLAYER = { id: 'zagorakis-user' }
const MATCH = {
  id: 'g1', coach_user_id: 'coach-1', published: true, event_type: 'match', title: 'League', opponent: 'Parkview Athletic',
  home_away: 'home', event_date: '2099-11-14', start_time: '10:00:00', starts_at: '2099-11-14T06:00:00Z', venue: 'Rehearsal Park',
  meet_time: '09:15:00', kit: 'Blue shirts', status: 'scheduled', cancel_reason: null, sequence: 0, family_note: null,
}
const FAMILY = { event_id: 'g1', squad_player_id: 'zagorakis', role: 'starter', job: '', has_note: false,
  shared_at: '2099-11-10T15:30:00Z', changed_at: null, coach_name: 'Otto Rehhagel' }
const OWN = { event_id: 'g1', squad_player_id: 'zagorakis', goals: [{ title: 'Win it back in their half', looks_like: 'Press when their keeper plays short.' }],
  job: 'Stay tight to their winger.', note: 'Their left winger is quick. Enjoy it.', shared_at: '2099-11-10T15:30:00Z', changed_at: null }
const LINE_UP = [
  { event_id: 'g1', squad_player_id: 'nikopolidis', role: 'starter', slot: 1, name: 'Antonios Nikopolidis', formation: '4-4-2' },
  { event_id: 'g1', squad_player_id: 'zagorakis', role: 'starter', slot: 5, name: 'Theodoros Zagorakis', formation: '4-4-2' },
  { event_id: 'g1', squad_player_id: 'fyssas', role: 'bench', slot: null, name: 'Takis Fyssas', formation: '4-4-2' },
]
// What Publish wrote (game_review_for_family, game_review_for_player): the job, did the job and the note are his alone.
const REVIEW = { event_id: 'g1', session_id: 's1', squad_player_id: 'zagorakis', our_score: 2, their_score: 1,
  expectation: 'lead', context: [], against_expectation: 'above', coach_name: 'Otto Rehhagel', published_at: '2099-11-14T10:00:00Z' }
const REVIEW_OWN = { event_id: 'g1', squad_player_id: 'zagorakis', note: 'Two good crosses in the first half.', job: 'Stay tight to their winger.', did_job: 'yes' }

function setup({ look = true, family = [FAMILY], own = [OWN], reviews = [] as object[], age = 14 } = {}) {
  const profiles = [{ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Theodoros Zagorakis' }]
  const one = (rows: object[]) => ({ request }: { request: Request }) =>
    (request.headers.get('Accept') ?? '').includes('vnd.pgrst.object') ? HttpResponse.json(rows[0] ?? null) : HttpResponse.json(rows)
  server.use(
    rpc('family_feature_on', ({ p_feature }) => look && p_feature === 'family_look'),
    table('game_for_family', family as Record<string, unknown>[]),
    table('game_for_player', own as Record<string, unknown>[]),
    table('game_lineup_for_players', family.length ? LINE_UP : []),
    http.get(`${SUPABASE_URL}/rest/v1/game_review_for_family`, one(reviews)),
    table('game_review_for_player', reviews.length ? [REVIEW_OWN] : []),
    http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
      const asked = new URL(request.url).searchParams.get('user_id') ?? ''
      const rows = profiles.filter(profile => asked.includes(profile.user_id))
      return (request.headers.get('Accept') ?? '').includes('vnd.pgrst.object') ? HttpResponse.json(rows[0] ?? null) : HttpResponse.json(rows)
    }),
    table('matches', []), table('player_details', []), table('coach_assessments', []), table('recognition_awards', []),
    table('squad_players', [{ id: 'zagorakis', coach_user_id: 'coach-1' }]),
    table('event_absences', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('family_training_history', () => []),
    rpcRows('child_events', [MATCH]),
    rpc('my_consent_status', () => ({ required: false, age, consent_age: 15, threshold: 18, own_choice: null })),
  )
}

beforeEach(() => { localStorage.clear(); PLAYER = { id: `zagorakis-user-${++n}` }; signInAs(PLAYER) })
afterEach(() => cleanup())
// The match's own tabs: the phone's tab bar at the foot of the page is a tab list too.
const matchTabs = () => within(screen.getByRole('tablist', { name: 'vs Parkview Athletic' })).getAllByRole('tab').map(tab => tab.textContent)

describe('TRAK-441: the player\'s match page in the coach\'s look', { timeout: 30_000 }, () => {
  it('before the match: the header says it once, "You start", and the Game plan tab opens, marked New', async () => {
    setup()
    renderApp('/player/event/g1')
    expect(await screen.findByRole('heading', { level: 1, name: 'vs Parkview Athletic' })).toBeInTheDocument()
    expect(screen.getByText('You start')).toBeInTheDocument()
    expect(screen.getByText('Sat 14 Nov')).toBeInTheDocument()
    expect(screen.getByText(/Kick-off 10:00/)).toBeInTheDocument()
    expect(screen.getByText('Rehearsal Park')).toBeInTheDocument()

    expect(matchTabs()).toEqual(['Logistics', 'Game planNew', 'Evaluation'])
    expect(screen.getByRole('tab', { name: /Game plan/ })).toHaveAttribute('aria-selected', 'true')

    const panel = screen.getByRole('tabpanel')
    const job = within(panel).getByRole('heading', { name: 'Your job' }).closest('section')!
    expect(within(job).getByText('Stay tight to their winger.')).toBeInTheDocument()
    expect(within(job).getByText('Only you')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: 'From Coach Otto Rehhagel' })).toBeInTheDocument()
    expect(within(panel).getByText('Their left winger is quick. Enjoy it.')).toBeInTheDocument()
    const team = within(panel).getByRole('heading', { name: 'Team instructions' }).closest('section')!
    expect(within(team).getByText('Win it back in their half')).toBeInTheDocument()
    expect(within(team).getByText('Press when their keeper plays short.')).toBeInTheDocument()
    expect(within(panel).getByRole('region', { name: 'Line-up' })).toBeInTheDocument()

    // The old page's rows and Back link are gone: the header and the trail say it.
    expect(screen.queryByRole('list', { name: 'Event details' })).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Matches')
    // Before the match he never reads what the coach expected of him.
    expect(document.body.textContent).not.toMatch(/expect|take charge|big ask|normal game/i)
  })

  it('Logistics holds what the header doesn\'t say: the meeting time and the kit, and no Can\'t make it below the consent age', async () => {
    setup()
    renderApp('/player/event/g1')
    await userEvent.click(await screen.findByRole('tab', { name: 'Logistics' }))
    const rows = within(screen.getByRole('tabpanel')).getByRole('list', { name: 'Event details' })
    expect(rows).toHaveTextContent('Meet09:15, 45 min before kick-off')
    expect(rows).toHaveTextContent('KitBlue shirts')
    expect(rows).not.toHaveTextContent(/Date|Venue|Rehearsal Park/)
    expect(screen.queryByRole('button', { name: /Can.t make it/ })).toBeNull()
  })

  it('a player at the consent age says Can\'t make it for himself, in Logistics', async () => {
    setup({ age: 15 })
    renderApp('/player/event/g1')
    await userEvent.click(await screen.findByRole('tab', { name: 'Logistics' }))
    expect(await within(screen.getByRole('tabpanel')).findByRole('button', { name: /Can.t make it/ })).toBeInTheDocument()
  })

  it('after the match: the result is the badge, and the Evaluation tab opens, marked New, with his job, how it went and the note', async () => {
    setup({ reviews: [REVIEW] })
    renderApp('/player/event/g1')
    expect(await screen.findByText('Won 2–1')).toBeInTheDocument()
    expect(screen.queryByText('You start')).toBeNull()
    expect(matchTabs()).toEqual(['Logistics', 'Game plan', 'EvaluationNew'])
    expect(screen.getByRole('tab', { name: /Evaluation/ })).toHaveAttribute('aria-selected', 'true')

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Stay tight to their winger.')).toBeInTheDocument()
    expect(within(panel).getByText('You did your job')).toBeInTheDocument()
    expect(within(panel).getByText('Against what we expected')).toBeInTheDocument()
    expect(within(panel).getByText('We needed you to take charge.')).toBeInTheDocument()
    expect(within(panel).getByText('Above')).toBeInTheDocument()
    const note = within(panel).getByRole('heading', { name: 'From Coach Otto Rehhagel' }).closest('section')!
    expect(within(note).getByText('Two good crosses in the first half.')).toBeInTheDocument()
    expect(within(note).getByText('Only you')).toBeInTheDocument()
  })

  it('a plan he has opened on this device is no longer New', async () => {
    setup()
    const first = renderApp('/player/event/g1')
    expect(await screen.findByRole('tab', { name: /Game plan/ })).toHaveTextContent('New')
    first.unmount()
    renderApp('/player/event/g1')
    expect(await screen.findByRole('tab', { name: /Game plan/ })).not.toHaveTextContent('New')
  })

  it('with nothing shared yet, Logistics opens and the header has no badge', async () => {
    setup({ family: [], own: [] })
    renderApp('/player/event/g1')
    expect(await screen.findByRole('tab', { name: 'Logistics' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('You start')).toBeNull()
  })

  it('with the switch off the page stays as it was', async () => {
    setup({ look: false })
    renderApp('/player/event/g1')
    expect(await screen.findByRole('region', { name: 'Game plan' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'vs Parkview Athletic' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Event details' })).toHaveTextContent('Venue')
  })
})
