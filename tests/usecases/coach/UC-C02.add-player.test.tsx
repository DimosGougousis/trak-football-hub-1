import { it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCase } from '../../support/use-case'
import { renderApp } from '../../support/render-app'
import { signInAs } from '../../support/session'
import { server } from '../../msw/server'
import { table, insertInto } from '../../msw/supabase'

const COACH = { id: 'coach-1' }

function signedInCoach() {
  signInAs(COACH)
  server.use(
    table('profiles', [
      { id: 'p-coach', user_id: COACH.id, role: 'coach', full_name: 'Coach Vasilis', nationality: 'GR' },
    ]),
  )
}

/*
 * The redesigned add-player screen no longer has a single "Add to Squad"
 * button — it has two: "Save & add another" (stays put, clears the name so a
 * coach can enter the next player) and "Save & finish" (saves and navigates
 * back to /coach/squad). Only "Save & finish" completes the use case as
 * registered: UC-C02's `then` clauses require the row to persist AND the
 * coach to land back on the squad screen. "Save & add another" satisfies
 * only the first of those, so every test below drives "Save & finish".
 */
async function setupAndAddPlayerName(playerName: string) {
  renderApp('/coach/squad/add')
  const user = userEvent.setup()
  const nameInput = await screen.findByRole('textbox')
  await user.type(nameInput, playerName)
  const saveButton = screen.getByRole('button', { name: /save & finish/i })
  return { user, saveButton }
}

useCase('UC-C02', () => {
  it('persists a squad_players row against that coach', async () => {
    signedInCoach()
    const inserted: Record<string, unknown>[] = []
    server.use(
      insertInto('squad_players', body => {
        inserted.push(body)
        return { id: 'squad-1', ...body }
      }),
      table('squad_players', []),
      // "Save & finish" navigates to /coach/squad on success, and
      // CoachSquadPage also fetches coach_assessments for the band pill —
      // mock it so that post-redirect request doesn't reach MSW unhandled.
      table('coach_assessments', []),
    )

    const { user, saveButton } = await setupAndAddPlayerName('Nikos Papadopoulos')
    await user.click(saveButton)

    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]).toMatchObject({
      coach_user_id: COACH.id,
      player_name: 'Nikos Papadopoulos',
    })
  })

  it('returns the coach to the squad screen after saving', async () => {
    signedInCoach()
    server.use(
      insertInto('squad_players', body => ({ id: 'squad-1', ...body })),
      table('squad_players', [
        { id: 'squad-1', coach_user_id: COACH.id, player_name: 'Nikos Papadopoulos', position: null, shirt_number: null },
      ]),
      table('coach_assessments', []),
    )

    const { user, saveButton } = await setupAndAddPlayerName('Nikos Papadopoulos')
    await user.click(saveButton)

    // The squad screen's title is now "Squad" (rendered as an <h1>), not
    // "SQUAD" — the NavBar also has a "Squad" tab label, so scope the query
    // to the heading role to avoid matching both.
    expect(await screen.findByRole('heading', { name: 'Squad' })).toBeInTheDocument()
  })

  it('refuses to save while the name is empty', async () => {
    signedInCoach()
    const inserted: unknown[] = []
    server.use(
      insertInto('squad_players', body => { inserted.push(body); return { id: 'x', ...body } }),
    )

    renderApp('/coach/squad/add')
    const user = userEvent.setup()
    const save = await screen.findByRole('button', { name: /save & finish/i })

    expect(save).toBeDisabled()
    await user.click(save)
    expect(inserted).toHaveLength(0)
  })
})
