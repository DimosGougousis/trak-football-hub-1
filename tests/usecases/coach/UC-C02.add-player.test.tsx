import { it, expect, vi } from 'vitest'
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
    )

    renderApp('/coach/squad/add')
    const user = userEvent.setup()

    const nameInput = await screen.findByRole('textbox')
    await user.type(nameInput, 'Nikos Papadopoulos')
    await user.click(screen.getByRole('button', { name: /add to squad/i }))

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
    )

    renderApp('/coach/squad/add')
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox'), 'Nikos Papadopoulos')
    await user.click(screen.getByRole('button', { name: /add to squad/i }))

    expect(await screen.findByText('SQUAD')).toBeInTheDocument()
  })

  it('refuses to save while the name is empty', async () => {
    signedInCoach()
    const inserted: unknown[] = []
    server.use(
      insertInto('squad_players', body => { inserted.push(body); return { id: 'x', ...body } }),
    )

    renderApp('/coach/squad/add')
    const save = await screen.findByRole('button', { name: /add to squad/i })

    expect(save).toBeDisabled()
    expect(inserted).toHaveLength(0)
  })
})
