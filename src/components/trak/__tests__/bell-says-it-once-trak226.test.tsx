import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PlayerAlertsBell } from '@/components/player/PlayerAlertsBell'
import type { PlayerEvent } from '@/lib/player-events'

/**
 * TRAK-226 (20 Oct live run, S6/S7): a cancellation alert, opened, showed its
 * line twice (the one-line preview, then the same text again under it), and
 * the player's assessment alert said "published an assessment" twice under a
 * title that already said so. An alert now has one title and one supporting
 * line: opening it unfolds that line in full instead of repeating it.
 */

afterEach(cleanup)
const LONG = 'The pitch is closed after the storm and the council has not said when it reopens, so we will rearrange next week'
const cancelled: PlayerEvent = {
  id: 'ev-1', kind: 'match', title: null, date: '2026-10-24', time: '11:00', meetTime: null, venue: 'Municipal Ground',
  kit: null, opponent: 'PAOK U16', homeAway: 'home', status: 'cancelled', cancelReason: LONG, sequence: 2,
  updatedAt: '2026-10-20T16:00:00Z', familyNote: null, startsAt: '2026-10-24T08:00:00Z',
}

async function openBell(props: Partial<Parameters<typeof PlayerAlertsBell>[0]> = {}) {
  render(<MemoryRouter><PlayerAlertsBell userId="player-1" events={[]} {...props} /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }))
  return screen.findByRole('dialog', { name: 'Alerts' })
}
const count = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.includes(text))).length

describe('TRAK-226: an alert says each thing once', () => {
  it('a cancellation, opened: the reason shows once, in full', async () => {
    const panel = await openBell({ events: [cancelled] })
    expect(within(panel).getByText('Cancelled: Match vs PAOK U16 (home)')).toBeInTheDocument()
    expect(count(panel, LONG)).toBe(1)
    await userEvent.click(within(panel).getByRole('button', { name: /^Cancelled: Match vs PAOK U16 \(home\), unread\. Show details$/ }))
    expect(count(panel, LONG)).toBe(1)
    expect(within(panel).getByText(content => content.includes(LONG))).toHaveAttribute('data-full', 'true')
    expect(within(panel).getByRole('button', { name: 'Open event' })).toBeInTheDocument()
  })

  it("the player's assessment: a title and one different line, once each, open or closed", async () => {
    const panel = await openBell({ assessment: { id: 'as-1', userId: 'player-1', publishedAt: '2026-10-20T16:00:00Z', coachName: 'Angelos Basinas' } })
    const line = 'Your ratings and a message to read.'
    expect(count(panel, 'New assessment from Coach Angelos Basinas')).toBe(1)
    expect(count(panel, line)).toBe(1)
    expect(within(panel).queryByText(/published an assessment/)).toBeNull()
    await userEvent.click(within(panel).getByRole('button', { name: /Show details$/ }))
    expect(count(panel, line)).toBe(1)
    expect(within(panel).getByRole('button', { name: 'Open assessment' })).toBeInTheDocument()
  })
})
