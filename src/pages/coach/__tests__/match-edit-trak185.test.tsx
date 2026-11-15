/**
 * TRAK-185 part 1 (J4, 16 Oct live run): a logged match couldn't be corrected.
 * The coach opens it and changes the score and each player's goals, assists
 * and card; the database applies the logging rules to the whole match at once
 * (edit_logged_match). Driven through the rendered app and the real SDK.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { matchRating } from '@/lib/match-rating'

const COACH = { id: 'coach-1' }
const MATCH = {
  id: 'match-1', coach_user_id: COACH.id, session_type: 'match', title: 'vs Synthetic Rovers',
  training_type: null, session_date: '2026-10-15', notes: null, created_at: '2026-10-15T18:00:00Z',
}
const row = (over: Record<string, unknown>): Record<string, unknown> => ({
  position: 'Attacker', age_group: 'U16', competition: 'League', venue: 'Home', opponent: 'Synthetic Rovers',
  match_date: '2026-10-15', minutes_played: null, goals: 0, assists: 0, card_received: 'None',
  team_score: 2, opponent_score: 1, locked: false, played: true, ...over,
})
const ADE = row({ user_id: 'u-ade', player_name: 'Ade Okafor', goals: 1 })
const BEN = row({ user_id: 'u-ben', player_name: 'Ben White', position: 'Midfielder', goals: 1, assists: 1 })

let edits: Record<string, unknown>[]
let editReply: () => Response

function fixtures(rows = [ADE, BEN]) {
  edits = []
  editReply = () => HttpResponse.json(rows.length)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(`${SUPABASE_URL}/rest/v1/coach_sessions`, () => HttpResponse.json([MATCH])),
    table('squad_players', []),
    table('session_attendance', []),
    table('coach_assessments', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('logged_match', () => rows),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/edit_logged_match`, async ({ request }) => {
      edits.push(await request.json() as Record<string, unknown>)
      return editReply()
    }),
  )
}

const goalsFor = (name: string) => screen.getByRole('group', { name: `Goals for ${name}` })

describe('TRAK-185: correcting a logged match', { timeout: 20_000 }, () => {
  beforeEach(() => signInAs(COACH))

  it('opens with the saved score and numbers, and saves a corrected 3-1 for every player', async () => {
    fixtures()
    const user = userEvent.setup()
    renderApp('/coach/sessions/match-1')
    const us = await screen.findByLabelText('Team score')
    expect(us).toHaveValue('2')
    expect(screen.getByLabelText('Opponent score')).toHaveValue('1')
    expect(within(goalsFor('Ade Okafor')).getByText('1')).toBeInTheDocument()

    await user.clear(us)
    await user.type(us, '3')
    await user.click(screen.getByRole('button', { name: 'One more goals for Ade Okafor' }))
    await user.click(screen.getByRole('button', { name: 'Save match' }))

    await waitFor(() => expect(edits).toHaveLength(1))
    const sent = edits[0] as { p_session_id: string; p_team_score: number; p_opponent_score: number; p_players: Record<string, unknown>[] }
    expect(sent).toMatchObject({ p_session_id: 'match-1', p_team_score: 3, p_opponent_score: 1 })
    const ade = sent.p_players.find(p => p.user_id === 'u-ade')!
    expect(ade).toMatchObject({ goals: 2, assists: 0, card: 'None' })
    // Rated exactly as the match log rates a new match.
    expect(ade.computed_rating).toBe(matchRating({ position: 'Attacker', competition: 'League', venue: 'Home',
      opponent: 'Synthetic Rovers', scoreUs: 3, scoreThem: 1, card: 'None', goals: 2, assists: 0 }))
    expect(sent.p_players).toHaveLength(2)
    expect(await screen.findByText(/Match updated/)).toBeInTheDocument()
  })

  it('an impossible edit is stopped on screen, and nothing is sent', async () => {
    fixtures()
    const user = userEvent.setup()
    renderApp('/coach/sessions/match-1')
    await screen.findByLabelText('Team score')
    await user.click(screen.getByRole('button', { name: 'One more goals for Ben White' }))
    expect(screen.getByText(/3 goals entered, but the team scored 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save match' })).toBeDisabled()
    expect(edits).toHaveLength(0)
  })

  it('a refusal from the database is shown in its words, and what was typed stays', async () => {
    fixtures()
    editReply = () => HttpResponse.json({ code: '42501', message: "Waiting for parent: player u-ben can't be edited until a parent approves" }, { status: 403 })
    const user = userEvent.setup()
    renderApp('/coach/sessions/match-1')
    const us = await screen.findByLabelText('Team score')
    await user.clear(us)
    await user.type(us, '3')
    await user.click(screen.getByRole('button', { name: 'Save match' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Waiting for parent/)
    expect(screen.getByLabelText('Team score')).toHaveValue('3')
  })

  it('a child waiting for consent is shown, not editable, and the match can\'t be saved', async () => {
    fixtures([ADE, { ...BEN, goals: null, assists: null, card_received: null, locked: true }])
    renderApp('/coach/sessions/match-1')
    await screen.findByLabelText('Team score')
    expect(screen.getByText(/Ben White.*waiting for a parent/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'One more goals for Ben White' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save match' })).toBeDisabled()
  })

  it('a match logged before edits existed stays read-only and says why', async () => {
    fixtures([])
    renderApp('/coach/sessions/match-1')
    expect(await screen.findByText(/logged before matches could be edited/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save match' })).toBeNull()
  })
})

// TRAK-185 part 2 (Imad, 18 Oct): a player removed from the match stays on it,
// as "Didn't play", and doesn't count. The database keeps their record.
describe('TRAK-185: marking a player as not having played', { timeout: 20_000 }, () => {
  beforeEach(() => signInAs(COACH))

  function withMarks(rows: Record<string, unknown>[]) {
    fixtures(rows)
    const marks: Record<string, unknown>[] = []
    let current = rows
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/logged_match`, () => HttpResponse.json(current)),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/mark_match_appearance`, async ({ request }) => {
        const body = await request.json() as { p_user_id: string; p_played: boolean }
        marks.push(body)
        current = current.map(r => r.user_id === body.p_user_id
          ? { ...r, played: body.p_played, goals: body.p_played ? r.goals : null, assists: body.p_played ? r.assists : null } : r)
        return HttpResponse.json(null)
      }),
    )
    return marks
  }

  it('Didn\'t play moves a player off the stats and keeps them on the match', async () => {
    const marks = withMarks([{ ...ADE, played: true }, { ...BEN, played: true }])
    const user = userEvent.setup()
    renderApp('/coach/sessions/match-1')
    await screen.findByLabelText('Team score')
    await user.click(screen.getByRole('button', { name: "Mark Ben White as didn't play" }))
    await waitFor(() => expect(marks).toEqual([expect.objectContaining({ p_session_id: 'match-1', p_user_id: 'u-ben', p_played: false })]))
    const didnt = await screen.findByRole('list', { name: "Didn't play" })
    expect(within(didnt).getByText('Ben White')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Goals for Ben White' })).toBeNull()

    // A save now sends only the players who played.
    await user.click(screen.getByRole('button', { name: 'Save match' }))
    await waitFor(() => expect(edits).toHaveLength(1))
    expect((edits[0] as { p_players: { user_id: string }[] }).p_players.map(p => p.user_id)).toEqual(['u-ade'])

    await user.click(within(didnt).getByRole('button', { name: 'Ben White played after all' }))
    await waitFor(() => expect(marks[1]).toMatchObject({ p_user_id: 'u-ben', p_played: true }))
    expect(await screen.findByRole('group', { name: 'Goals for Ben White' })).toBeInTheDocument()
  })

  it('waits for unsaved numbers to be saved before moving anyone', async () => {
    withMarks([{ ...ADE, played: true }, { ...BEN, played: true }])
    const user = userEvent.setup()
    renderApp('/coach/sessions/match-1')
    await screen.findByLabelText('Team score')
    await user.click(screen.getByRole('button', { name: 'One more assists for Ade Okafor' }))
    expect(screen.getByRole('button', { name: "Mark Ben White as didn't play" })).toBeDisabled()
    expect(screen.getByText(/Save your changes first/)).toBeInTheDocument()
  })

  it('the last player who played can\'t be moved', async () => {
    withMarks([{ ...ADE, played: true }, { ...BEN, played: false, goals: null, assists: null, card_received: null }])
    renderApp('/coach/sessions/match-1')
    await screen.findByLabelText('Team score')
    expect(screen.queryByRole('button', { name: "Mark Ade Okafor as didn't play" })).toBeNull()
  })
})
