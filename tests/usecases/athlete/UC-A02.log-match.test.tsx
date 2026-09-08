import { it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCase } from '../../support/use-case'
import { renderApp } from '../../support/render-app'
import { signInAs } from '../../support/session'
import { server } from '../../msw/server'
import { table, insertInto } from '../../msw/supabase'

const ATHLETE = { id: 'athlete-1' }

function signedInAthlete() {
  signInAs(ATHLETE)
  server.use(
    table('profiles', [
      { id: 'p-athlete', user_id: ATHLETE.id, role: 'player', full_name: 'Nikos Papadopoulos', nationality: 'GR' },
    ]),
  )
}

async function fillAndSave() {
  const user = userEvent.setup()
  await user.type(await screen.findByPlaceholderText(/arsenal u18/i), 'Olympiacos U17')
  await user.click(screen.getByRole('button', { name: /^save match$/i }))
  return user
}

useCase('UC-A02', () => {
  it('persists a matches row with a computed rating', async () => {
    signedInAthlete()
    const inserted: Record<string, unknown>[] = []
    server.use(
      insertInto('matches', body => {
        inserted.push(body)
        return { id: 'match-1', created_at: new Date().toISOString(), ...body }
      }),
    )

    renderApp('/player/log')
    await fillAndSave()

    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]).toMatchObject({ user_id: ATHLETE.id })
    expect(typeof inserted[0].computed_rating).toBe('number')
  })

  it('takes the athlete to the result screen for that match', async () => {
    signedInAthlete()
    server.use(
      insertInto('matches', body => ({
        id: 'match-1',
        created_at: new Date().toISOString(),
        ...body,
      })),
    )

    renderApp('/player/log')
    await fillAndSave()

    expect(await screen.findByRole('button', { name: /^done$/i })).toBeInTheDocument()
  })

  it('renders no decimal number anywhere in the UI', async () => {
    signedInAthlete()
    server.use(
      insertInto('matches', body => ({
        id: 'match-1',
        created_at: new Date().toISOString(),
        ...body,
      })),
    )

    const { container } = renderApp('/player/log')
    await fillAndSave()
    await screen.findByRole('button', { name: /^done$/i })

    const visibleText = container.textContent ?? ''
    expect(
      visibleText,
      'UC-A02 forbids showing the hidden score. Found a decimal in the rendered output.',
    ).not.toMatch(/\d+\.\d+/)
  })
})
