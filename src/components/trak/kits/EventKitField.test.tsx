import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'
import { KIT_COLLECTIONS, snapshotKit, type EventKitSnapshot, type TeamKitSet } from '@/lib/kit-templates'
import { toPlayerEvent } from '@/lib/player-events'
import { EventKitField } from './EventKitField'
import { EventSheet } from '../EventSheet'
import { EventDetails } from '@/components/player/EventDetails'

const endpoint = `${SUPABASE_URL}/rest/v1/coach_team_kits`
let stored: TeamKitSet | null
let failSave: boolean
let reads: URL[]
beforeEach(() => {
  stored = null; failSave = false; reads = []
  server.use(
    http.get(endpoint, ({ request }) => { reads.push(new URL(request.url)); return HttpResponse.json(stored ? [{ kits: stored }] : []) }),
    http.post(endpoint, async ({ request }) => {
      if (failSave) return HttpResponse.json({ message: 'Unavailable' }, { status: 503 })
      const body = await request.json() as { coach_user_id: string; squad: string; kits: TeamKitSet }
      expect(body.coach_user_id).toBe('coach-203')
      expect(body.squad).toBe('U14')
      stored = body.kits
      return HttpResponse.json({ kits: stored })
    }),
  )
})
function Field() {
  const [value, setValue] = useState<EventKitSnapshot | null>(null)
  return <EventKitField coachId="coach-203" squad="U14" value={value} onChange={setValue} />
}

describe('saved team kit selection', () => {
  it('saves a custom set, survives a failed save, and selects an independent event design', async () => {
    const user = userEvent.setup()
    const view = render(<Field />)
    await user.click(await screen.findByRole('button', { name: 'Set up team kits' }))
    expect(reads[0].searchParams.get('squad')).toBe('eq.U14')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Start with a color set' }), 'royal-white')
    await user.click(screen.getByRole('button', { name: 'Pink' }))
    failSave = true
    await user.click(screen.getByRole('button', { name: 'Save team kits' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save team kits")
    expect(screen.getByRole('button', { name: 'Pink' })).toHaveAttribute('aria-pressed', 'true')
    failSave = false
    await user.click(screen.getByRole('button', { name: 'Save team kits' }))
    await screen.findByRole('button', { name: 'Edit team kits' })
    expect(screen.queryByRole('region', { name: 'What to wear' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /^Home/ }))
    const art = screen.getByRole('region', { name: 'What to wear' })
    expect(within(art).getByText('Pink')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit team kits' }))
    await user.click(screen.getByRole('button', { name: 'Navy' }))
    await user.click(screen.getByRole('button', { name: 'Save team kits' }))
    await screen.findByRole('button', { name: 'Edit team kits' })
    expect(within(art).getByText('Pink')).toBeVisible()
    view.unmount()
    render(<Field />)
    await screen.findByRole('button', { name: 'Edit team kits' })
    expect(screen.getByRole('radio', { name: /^Home/ })).not.toBeChecked()
    await user.click(screen.getByRole('radio', { name: /^Home/ }))
    expect(within(screen.getByRole('region', { name: 'What to wear' })).getByText('Navy')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Use text instructions instead' }))
    expect(screen.queryByRole('region', { name: 'What to wear' })).not.toBeInTheDocument()
  })

  it('distinguishes a failed read from a team without kits and retries', async () => {
    server.use(http.get(endpoint, () => HttpResponse.json({ message: 'Unavailable' }, { status: 403 })))
    const user = userEvent.setup()
    render(<Field />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load team kits")
    expect(screen.queryByRole('button', { name: 'Set up team kits' })).not.toBeInTheDocument()
    server.use(http.get(endpoint, () => HttpResponse.json([{ kits: KIT_COLLECTIONS[0].kits }])))
    await user.click(screen.getByRole('button', { name: 'Retry team kits' }))
    await screen.findByRole('radio', { name: /^Alternate/ })
  })

  it.each(['coach', 'parent', 'player'] as const)('shows the same stored snapshot in the %s sheet and family details', async role => {
    const event = toPlayerEvent({ id: 'event-203', event_type: 'match', opponent: 'Synthetic United', event_date: '2026-11-20', start_time: '17:00',
      kit: 'Readable calendar kit', kit_snapshot: snapshotKit(KIT_COLLECTIONS[0].kits, 'away') })!
    const user = userEvent.setup()
    const view = render(<MemoryRouter><EventSheet event={event} role={role} trigger={<button>Open kit event</button>} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Open kit event' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Away kit' })).toBeVisible()
    expect(within(sheet).getByRole('img')).toHaveAccessibleName(/Away kit: White shirt/)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    view.unmount()
    render(<EventDetails event={event} />)
    expect(screen.getByRole('heading', { name: 'Away kit' })).toBeVisible()
  })
})
