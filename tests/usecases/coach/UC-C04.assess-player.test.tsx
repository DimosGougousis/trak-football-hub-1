// @story J5
import { it, expect } from 'vitest'
import { setSlider, sliderValue, sliderDisabled } from '../../support/slider'
import { assessStep, nextButton, saveAssessment } from '../../support/assess-steps'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickOption } from '@/test/arc-select'
import { useCase } from '../../support/use-case'
import { renderApp } from '../../support/render-app'
import { signInAs } from '../../support/session'
import { server } from '../../msw/server'
import { table, insertInto, rpc, SUPABASE_URL } from '../../msw/supabase'
import { http, HttpResponse } from 'msw'

const COACH = { id: 'coach-1' }
const SQUAD = [
  { id: 'squad-1', coach_user_id: COACH.id, player_name: 'Nikos Papadopoulos', position: 'Midfielder', shirt_number: 8 },
]

function signedInCoachWithSquad() {
  signInAs(COACH)
  server.use(
    // invite_code is set so CoachHomePage's invite-code effect doesn't try
    // to generate one and PATCH /profiles, which nothing here mocks.
    table('profiles', [
      { id: 'p-coach', user_id: COACH.id, role: 'coach', full_name: 'Coach Vasilis', nationality: 'GR', invite_code: 'ABCD' },
    ]),
    table('squad_players', SQUAD),
    // v4 (TRAK-500): no session to select, so no sessions or attendance are read. coach_details is the
    // destination home screen's.
    table('coach_details', []),
  )
}

async function pickPlayer() {
  await pickOption('Player', 'Nikos Papadopoulos')
}

useCase('UC-C04', () => {
  it('persists six distinct slider values to the correct columns and updates the band', async () => {
    signedInCoachWithSquad()
    const inserted: Record<string, unknown>[] = []
    server.use(
      insertInto('coach_assessments', body => {
        inserted.push(body)
        return { id: 'assess-1', ...body }
      }),
      // handleSave navigates to /coach/home on success, and CoachHomePage
      // fetches a coach_assessments count on mount — mock it so that
      // post-redirect request doesn't reach MSW unhandled.
      table('coach_assessments', []),
    )

    renderApp('/coach/assess')
    const user = userEvent.setup()

    // The precondition is "a coach with at least one squad player" — that
    // means the squad fetch has actually resolved, not merely that the
    // (initially empty) <select> exists. Wait for the real option to render
    // before selecting it, otherwise this selects against a placeholder-only
    // combobox and fails with "Value not found in options".
    await pickPlayer()

    // All six sliders default to 5 — an implementation that hardcoded 5 into
    // every column, or wired all six sliders to one shared value, would pass
    // a test that only ever submits the defaults. Drive each slider (Arc's
    // elastic slider, by keyboard; one per SliderInput in
    // src/pages/coach/CoachAssessPage.tsx, in the DOM order Work Rate,
    // Tactical, Attitude, Technical, Physical, Coachability — the same order
    // the payload asserts below) to six *distinct* values instead.
    // TRAK-182: the sliders are the Ratings step.
    await assessStep('Ratings')
    const [workRate, tactical, attitude, technical, physical, coachability] =
      screen.getAllByRole('slider')
    setSlider(workRate, 10)
    setSlider(tactical, 9)
    setSlider(attitude, 8)
    setSlider(technical, 7)
    setSlider(physical, 6)
    setSlider(coachability, 5)

    // avg = (10+9+8+7+6+5)/6 = 7.5, which rounds to 8: 'good' / "Good"
    // (TRAK-556), distinct from the default avg-5 "Steady" band, proving the
    // band is derived from the six scores rather than fixed.
    const overallBandLabel = await screen.findByText('OVERALL BAND')
    const overallBandCard = overallBandLabel.parentElement as HTMLElement
    expect(within(overallBandCard).getByText('Good')).toBeInTheDocument()
    expect(within(overallBandCard).queryByText('Steady')).not.toBeInTheDocument()

    // TRAK-182: saving is the Review step's (Save, with no message).
    await saveAssessment()

    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]).toMatchObject({
      coach_user_id: COACH.id,
      squad_player_id: 'squad-1',
      work_rate: 10,
      tactical: 9,
      attitude: 8,
      technical: 7,
      physical: 6,
      coachability: 5,
    })
    // v4 (TRAK-500): no session; the database leaves it null.
    expect(inserted[0].session_id ?? null).toBeNull()
  }, 20_000) // TRAK-182: walking the steps; CI under load needs more than 5 s.

  it('shows a band derived from the six scores before submitting', async () => {
    signedInCoachWithSquad()
    server.use(table('coach_assessments', []))
    renderApp('/coach/assess')
    const user = userEvent.setup()
    await pickPlayer()
    await assessStep('Ratings')

    // All six sliders default to 5, so avg = 5. TRAK-556: scoreToBand in
    // src/lib/rating-engine.ts gives 5 and 6 'steady', which BANDS in
    // src/lib/types.ts renders as "Steady". The registry clause only requires
    // *a* band derived from the six scores to be shown before submitting, so
    // this asserts the word the engine produces for the default scores.
    //
    // "Steady" also appears once per slider (SliderInput shows a live
    // per-category band next to each of the six sliders), so a bare
    // `findByText('Steady')` is ambiguous. Scope to the "OVERALL BAND" card,
    // which is what the registry clause actually means by "a band derived
    // from the six scores".
    const overallBandLabel = await screen.findByText('OVERALL BAND')
    const overallBandCard = overallBandLabel.parentElement as HTMLElement
    expect(within(overallBandCard).getByText('Steady')).toBeInTheDocument()
  }, 20_000) // TRAK-182: walking the steps; CI under load needs more than 5 s.

  it('refuses to submit until a player is selected', async () => {
    signedInCoachWithSquad()
    const inserted: unknown[] = []
    server.use(
      insertInto('coach_assessments', body => { inserted.push(body); return { id: 'x', ...body } }),
    )

    renderApp('/coach/assess')
    const user = userEvent.setup()

    // Assert disabled the instant the button exists and this would pass even
    // if the squad never loaded, since the button starts disabled before any
    // player is selectable — that proves nothing about refusing submission
    // while a choice is available. Wait for the squad to load first, so the
    // disabled state is checked while a player genuinely could be chosen but
    // has not been.
    // TRAK-182: the first step's Next is the way to the save; it stays shut.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Player' })).toBeEnabled())
    const submit = nextButton()
    expect(submit).toBeDisabled()

    // Clicking a disabled button should be inert. Verifying nothing was
    // inserted distinguishes "the click did nothing" from "the click
    // submitted anyway", matching the sibling assertion in
    // UC-C02.add-player.test.tsx.
    await user.click(submit)
    expect(inserted).toHaveLength(0)

    // v4 (TRAK-500): the player is enough; no session is asked.
    await pickPlayer()
    expect(screen.queryByRole('combobox', { name: 'Session' })).toBeNull()
    await waitFor(() => expect(nextButton()).toBeEnabled())
    expect(inserted).toHaveLength(0)
  }, 20_000) // TRAK-182: walking the steps; CI under load needs more than 5 s.

  // v3 (TRAK-364): where the season plan is on and the squad's plan is shared, the due evaluation publishes all six
  // scores for each consented player, from their latest scores, with no session (the function writes session_id NULL;
  // supabase/tests/season_evaluations.sql proves the rows).
  it('publishes the six scores per consented player, from their latest, with no session, in an evaluation', async () => {
    signedInCoachWithSquad()
    // Its own coach: the app's query cache outlives a test, and the earlier ones' squad has no age group.
    const coach = { id: 'coach-uc-c04-evaluation' }
    signInAs(coach)
    const DAY = 86_400_000
    const day = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
    const published: Record<string, unknown>[] = []
    server.use(
      table('profiles', [{ id: 'p-eval', user_id: coach.id, role: 'coach', full_name: 'Coach Vasilis', invite_code: 'ABCD' }]),
      table('squad_players', [{ ...SQUAD[0], coach_user_id: coach.id, age_group: 'U16', status: 'active', linked_player_id: 'child-1', created_at: '2026-08-01T08:00:00Z' }]),
      table('coach_details', [{ user_id: coach.id, organization_id: 'org-1' }]),
      table('organizations', [{ id: 'org-1', time_zone: 'Asia/Dubai' }]),
      rpc('feature_on', ({ p_feature }) => p_feature === 'season_plan'),
      rpc('coach_squad_player_consent_required', () => false),
      table('season_plans', [{ id: 'plan-1', squad: 'U16', starts_on: day(-120), ends_on: day(200), shared_at: new Date(Date.now() - 90 * DAY).toISOString(),
        unshared_parts: [], unshared_players: [], eval_every: '2w', eval_day: 0 }]),
      table('season_evaluations', []), table('player_objectives', []), rpc('stuck_player_objectives', () => []),
      table('assessment_objectives', []),
      table('coach_assessments', [{ squad_player_id: 'squad-1', created_at: '2026-08-20T10:00:00Z', published_at: '2026-08-20T10:00:00Z',
        work_rate: 8, tactical: 7, attitude: 6, technical: 5, physical: 4, coachability: 3 }]),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/publish_evaluation_with_objectives`, async ({ request }) => {
        const args = await request.json() as Record<string, unknown> & { p_players: { squad_player_id: string }[] }
        published.push(args)
        return HttpResponse.json({ evaluation_id: 'ev-1', assessments: args.p_players.map(p => ({ squad_player_id: p.squad_player_id, assessment_id: 'as-1' })) })
      }),
    )
    renderApp('/coach/evaluation')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Nikos Papadopoulos/ }))
    // The band follows the six scores here too (TRAK-556, rounded): 8+7+6+5+4+3 is 5.5, Steady; Coachability up to 9
    // makes 6.5, which rounds to 7, Good.
    expect(screen.getByText('From last time: Steady, 5.5.')).toBeInTheDocument()
    setSlider(screen.getAllByRole('slider')[5], 9)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Next: Send' }))
    expect(within(screen.getByRole('region', { name: 'What changed' })).getByText('Steady → Good')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send to 1 player' }))
    await waitFor(() => expect(published).toHaveLength(1))
    expect(published[0]).toMatchObject({ p_plan_id: 'plan-1', p_players: [{ squad_player_id: 'squad-1',
      work_rate: 8, tactical: 7, attitude: 6, technical: 5, physical: 4, coachability: 9, report_note: '' }] })
    expect(published[0]).not.toHaveProperty('p_players.0.session_id')
  }, 20_000)

  // v6 (TRAK-531): report day sends one player first, and Send then sends only the rest (supabase/tests/
  // report_day_send_trak531.sql proves the day stays open and nobody is sent twice).
  it('sends one player first, then Send sends only the rest', async () => {
    const coach = { id: 'coach-uc-c04-send-one' }
    signInAs(coach)
    const DAY = 86_400_000
    const day = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
    const two = [['squad-1', 'Nikos Papadopoulos'], ['squad-2', 'Eleni Georgiou']].map(([id, name], i) => ({ id, player_name: name,
      coach_user_id: coach.id, position: 'Midfielder', shirt_number: 8 + i, age_group: 'U16', status: 'active', linked_player_id: `child-${i}`,
      created_at: '2026-08-01T08:00:00Z' }))
    const published: { p_players: { squad_player_id: string }[]; p_close: boolean; p_due_on: string }[] = []
    let evaluations: Record<string, unknown>[] = []
    let sent: { squad_player_id: string }[] = []
    server.use(
      table('profiles', [{ id: 'p-send', user_id: coach.id, role: 'coach', full_name: 'Coach Vasilis', invite_code: 'ABCD' }]),
      table('squad_players', two),
      table('coach_details', [{ user_id: coach.id, organization_id: 'org-1' }]),
      table('organizations', [{ id: 'org-1', time_zone: 'Asia/Dubai' }]),
      rpc('feature_on', ({ p_feature }) => p_feature === 'season_plan'),
      rpc('coach_squad_player_consent_required', () => false),
      table('season_plans', [{ id: 'plan-1', squad: 'U16', starts_on: day(-120), ends_on: day(200), shared_at: new Date(Date.now() - 90 * DAY).toISOString(),
        unshared_parts: [], unshared_players: [], eval_every: '2w', eval_day: 0 }]),
      http.get(`${SUPABASE_URL}/rest/v1/season_evaluations`, () => HttpResponse.json(evaluations)),
      http.get(`${SUPABASE_URL}/rest/v1/report_for_player`, () => HttpResponse.json(sent)),
      table('player_objectives', []), rpc('stuck_player_objectives', () => []), table('assessment_objectives', []),
      table('coach_assessments', two.map(p => ({ squad_player_id: p.id, created_at: '2026-08-20T10:00:00Z', published_at: '2026-08-20T10:00:00Z',
        work_rate: 6, tactical: 6, attitude: 6, technical: 6, physical: 6, coachability: 6 }))),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/publish_evaluation_with_objectives`, async ({ request }) => {
        const args = await request.json() as (typeof published)[number]
        published.push(args)
        evaluations = [{ id: 'ev-1', plan_id: 'plan-1', due_on: args.p_due_on, closed_at: args.p_close ? '2026-11-23T10:00:00Z' : null }]
        sent = [...sent, ...args.p_players.map(p => ({ squad_player_id: p.squad_player_id }))]
        return HttpResponse.json({ evaluation_id: 'ev-1', assessments: args.p_players.map(p => ({ squad_player_id: p.squad_player_id, assessment_id: `as-${p.squad_player_id}` })) })
      }),
    )
    renderApp('/coach/evaluation')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Nikos Papadopoulos/ }))
    await user.click(screen.getByRole('button', { name: 'Send Nikos’s report' }))
    await waitFor(() => expect(published).toHaveLength(1))
    expect(published[0]).toMatchObject({ p_close: false, p_players: [{ squad_player_id: 'squad-1' }] })
    await user.click(await screen.findByRole('button', { name: 'Next: Send' }))
    await user.click(screen.getByRole('button', { name: 'Send to 1 player' }))
    await waitFor(() => expect(published).toHaveLength(2))
    expect(published[1]).toMatchObject({ p_close: true, p_players: [{ squad_player_id: 'squad-2' }] })
  }, 20_000)

  // v5 (TRAK-526): where the squad's plan is shared, Assess asks how each open objective is going after Ratings, and
  // saves the six scores and the answers in one call once each has an answer (supabase/tests/assessment_objectives_trak526.sql
  // proves the rows, Met on publish and the refusals).
  it('asks how each open objective is going and saves the six scores with the answers', async () => {
    const coach = { id: 'coach-uc-c04-objectives' }
    signInAs(coach)
    const saved: Record<string, unknown>[] = []
    server.use(
      table('profiles', [{ id: 'p-obj', user_id: coach.id, role: 'coach', full_name: 'Coach Vasilis', invite_code: 'ABCD' }]),
      table('squad_players', [{ ...SQUAD[0], coach_user_id: coach.id, age_group: 'U16', status: 'active', linked_player_id: 'child-1', created_at: '2026-08-01T08:00:00Z' }]),
      table('coach_details', [{ user_id: coach.id, organization_id: 'org-1' }]),
      table('organizations', [{ id: 'org-1', time_zone: 'Asia/Dubai' }]),
      rpc('feature_on', ({ p_feature }) => p_feature === 'season_plan'),
      rpc('coach_squad_player_consent_required', () => false),
      table('season_plans', [{ id: 'plan-1', squad: 'U16', starts_on: '2026-08-03', ends_on: '2027-05-30', shared_at: '2026-09-01T09:00:00Z',
        unshared_parts: [], unshared_players: [], eval_every: 'month', eval_day: 0 }]),
      table('player_objectives', [{ id: 'obj-1', squad_player_id: 'squad-1', title: 'Scan before receiving', source: 'own', season_objective_id: null,
        created_at: '2026-09-01T09:00:00Z', status: 'open', retired_at: null }]),
      table('season_evaluations', []), rpc('stuck_player_objectives', () => []), table('coach_assessments', []),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/save_assessment_with_objectives`, async ({ request }) => {
        saved.push(await request.json() as Record<string, unknown>)
        return HttpResponse.json('assess-1')
      }),
    )
    renderApp('/coach/assess')
    const user = userEvent.setup()
    await pickPlayer()
    // TRAK-559: the player and the bands are one step, then objectives and notes, then review.
    setSlider((await screen.findAllByRole('slider'))[0], 8)
    await waitFor(() => expect(nextButton()).toBeEnabled())
    await user.click(nextButton())
    const answers = await screen.findByRole('group', { name: 'Progress on Scan before receiving' })
    expect(nextButton()).toBeDisabled()
    await user.click(within(answers).getByRole('button', { name: 'Some progress' }))
    await user.click(nextButton())
    // v7 (TRAK-532): with a shared plan, one Save and no Publish. v8 (TRAK-585): that Save publishes it.
    expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ p_assessment_id: null, p_row: { squad_player_id: 'squad-1', work_rate: 8 },
      p_progress: [{ player_objective_id: 'obj-1', status: 'some_progress' }], p_add: [] })
    expect(saved[0]).not.toHaveProperty('p_row.session_id')
    expect(saved[0]).not.toHaveProperty('p_row.published_at')
  }, 20_000)
})
