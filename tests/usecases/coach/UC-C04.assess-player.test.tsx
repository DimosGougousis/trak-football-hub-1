import { it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCase } from '../../support/use-case'
import { renderApp } from '../../support/render-app'
import { signInAs } from '../../support/session'
import { server } from '../../msw/server'
import { table, insertInto } from '../../msw/supabase'

const COACH = { id: 'coach-1' }
const SQUAD = [
  { id: 'squad-1', coach_user_id: COACH.id, player_name: 'Nikos Papadopoulos', position: 'Midfielder', shirt_number: 8 },
]

function signedInCoachWithSquad() {
  signInAs(COACH)
  server.use(
    table('profiles', [
      { id: 'p-coach', user_id: COACH.id, role: 'coach', full_name: 'Coach Vasilis', nationality: 'GR' },
    ]),
    table('squad_players', SQUAD),
  )
}

useCase('UC-C04', () => {
  it('persists all six category scores', async () => {
    signedInCoachWithSquad()
    const inserted: Record<string, unknown>[] = []
    server.use(
      insertInto('coach_assessments', body => {
        inserted.push(body)
        return { id: 'assess-1', ...body }
      }),
    )

    renderApp('/coach/assess')
    const user = userEvent.setup()

    // The precondition is "a coach with at least one squad player" — that
    // means the squad fetch has actually resolved, not merely that the
    // (initially empty) <select> exists. Wait for the real option to render
    // before selecting it, otherwise this selects against a placeholder-only
    // combobox and fails with "Value not found in options".
    await screen.findByRole('option', { name: 'Nikos Papadopoulos' })
    await user.selectOptions(screen.getByRole('combobox'), 'squad-1')
    await user.click(screen.getByRole('button', { name: /submit assessment/i }))

    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]).toMatchObject({
      coach_user_id: COACH.id,
      squad_player_id: 'squad-1',
      work_rate: 5,
      tactical: 5,
      attitude: 5,
      technical: 5,
      physical: 5,
      coachability: 5,
    })
  })

  it('shows a band derived from the six scores before submitting', async () => {
    signedInCoachWithSquad()
    renderApp('/coach/assess')

    // All six sliders default to 5. scoreToBand(5) in src/lib/rating-engine.ts
    // returns 'developing' (5 is below the 5.6 threshold for 'mixed' but at
    // or above the 4.8 threshold for 'developing'), which BANDS in
    // src/lib/types.ts renders as the word "Developing". The registry clause
    // only requires *a* band derived from the six scores to be shown before
    // submitting — it does not name a particular word — so this asserts the
    // word the engine actually produces.
    expect(await screen.findByText('Developing')).toBeInTheDocument()
  })

  it('refuses to submit until a player is selected', async () => {
    signedInCoachWithSquad()
    renderApp('/coach/assess')

    // Assert disabled the instant the button exists and this would pass even
    // if the squad never loaded, since the button starts disabled before any
    // player is selectable — that proves nothing about refusing submission
    // while a choice is available. Wait for the squad to load first, so the
    // disabled state is checked while a player genuinely could be chosen but
    // has not been.
    await screen.findByRole('option', { name: 'Nikos Papadopoulos' })
    expect(screen.getByRole('button', { name: /submit assessment/i })).toBeDisabled()
  })
})
