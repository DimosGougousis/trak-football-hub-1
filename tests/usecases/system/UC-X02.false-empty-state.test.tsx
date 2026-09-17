import { it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { useCase } from '../../support/use-case'
import { renderApp } from '../../support/render-app'
import { signInAs } from '../../support/session'
import { server } from '../../msw/server'
import { table, tableError } from '../../msw/supabase'

const ATHLETE = { id: 'athlete-1' }

function signedInAthlete() {
  signInAs(ATHLETE)
  server.use(
    table('profiles', [
      { id: 'p-athlete', user_id: ATHLETE.id, role: 'player', full_name: 'Nikos Papadopoulos', nationality: 'GR' },
    ]),
  )
}

/**
 * Waits for the mocked matches response to land. The screen renders its
 * heading and filter chips synchronously, so waiting on those proves nothing
 * about whether the failure was processed.
 */
async function matchesRequestSettled(run: () => void) {
  let landed = false
  const onResponse = ({ request }: { request: Request }) => {
    if (request.url.includes('/matches')) landed = true
  }
  server.events.on('response:mocked', onResponse)
  try {
    run()
    await waitFor(() => expect(landed).toBe(true))
  } finally {
    server.events.removeListener('response:mocked', onResponse)
  }
}

useCase('UC-X02', () => {
  it('shows a retryable error when the request fails', async () => {
    signedInAthlete()
    server.use(tableError('matches', 401, { code: '42501', message: 'permission denied for table matches' }))

    await matchesRequestSettled(() => renderApp('/player/matches'))

    // "A retryable error is shown"
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('does not render the empty-state message for a failed request', async () => {
    signedInAthlete()
    server.use(tableError('matches', 500, { message: 'upstream unavailable' }))

    await matchesRequestSettled(() => renderApp('/player/matches'))

    // "The error is visibly different from the genuine empty state" — half one:
    // the empty copy must be absent. A player with a full season must never be
    // told their record does not exist.
    expect(screen.queryByText(/no matches found/i)).toBeNull()
  })

  it('renders the empty state, and no error, when the request genuinely returns nothing', async () => {
    signedInAthlete()
    server.use(table('matches', []))

    await matchesRequestSettled(() => renderApp('/player/matches'))

    // "The error is visibly different from the genuine empty state" — half two.
    // Without this the first two tests could be satisfied by showing the error
    // unconditionally, which would be just as dishonest in the other direction.
    expect(await screen.findByText(/no matches found/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
