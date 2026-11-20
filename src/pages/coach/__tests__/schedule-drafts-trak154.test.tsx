// @story J8
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { toInstant } from '@/lib/event-time'

// TRAK-162 parks the import; switched on here so "Review and publish" after an import is proven for when it returns.
vi.mock('@/lib/fixture-import', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/fixture-import')>()),
  FIXTURE_IMPORT_ENABLED: true,
}))

/**
 * TRAK-154 (J8.6): every draft still to come is counted at the top of Events, and Review publishes the ticked ones in
 * one tap. "Published N" only when the database confirms N. Driven through the rendered page and the SDK.
 */

const COACH = { id: 'coach-154' }
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
const HEADER = 'Date,Kickoff,Meet time,Opponent,Home or away,Venue,Kit'

const row = (id: string, title: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, coach_user_id: COACH.id, title, event_type: 'training', starts_at: toInstant(date, '10:00'), ends_at: null,
  event_date: date, start_time: '10:00:00', venue: null, opponent: null, notes: null, published: false, source: 'manual',
  meet_time: null, kit: null, home_away: null, status: 'scheduled', cancel_reason: null, ...extra,
})
const UPCOMING = [
  row('d1', 'Training A', '2099-11-07'),
  row('d2', 'Training B', '2099-11-14'),
  row('d3', 'Training C', '2099-12-05'),
]
const NOT_LISTED = [
  row('past', 'Old draft', '2020-01-04'),
  row('gone', 'Cancelled draft', '2099-11-21', { status: 'cancelled' }),
  row('live', 'Published one', '2099-11-28', { published: true }),
]

let rows: Record<string, unknown>[]
let patches: { query: string; body: unknown }[]
let confirm: (ids: string[]) => string[]
let emailNudges: number
let reads: number

function fixtures() {
  rows = [...UPCOMING, ...NOT_LISTED]
  patches = []
  confirm = ids => ids
  emailNudges = 0
  reads = 0
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => { reads++; return HttpResponse.json(rows) }),
    table('coach_sessions', []),
    table('squad_players', []),
    rpc('feature_on', ({ p_feature }) => p_feature !== 'games'),
    http.patch(EVENTS, async ({ request }) => {
      const query = decodeURIComponent(new URL(request.url).search)
      patches.push({ query, body: await request.json() })
      const asked = /id=in\.\(([^)]*)\)/.exec(query)?.[1].split(',').map(id => id.replace(/"/g, '')) ?? []
      return HttpResponse.json(confirm(asked).map(id => ({ id })))
    }),
    http.post(EVENTS, async ({ request }) => {
      const batch = (await request.json()) as Record<string, unknown>[]
      const saved = batch.map((r, i) => ({ ...r, id: `new-${i}`, status: 'scheduled' }))
      rows = [...rows, ...saved]
      return HttpResponse.json(saved.map(r => ({ id: r.id })), { status: 201 })
    }),
    http.post(`${SUPABASE_URL}/functions/v1/send-event-emails`, () => { emailNudges++; return HttpResponse.json({}, { status: 202 }) }),
  )
}

async function openEvents() {
  renderApp('/coach/schedule')
  await waitFor(() => expect(screen.queryByRole('note', { name: 'This screen is coming soon' })).toBeNull())
}
async function openReview() {
  await openEvents()
  await userEvent.click(await screen.findByRole('button', { name: 'Review' }))
  return screen.findByRole('dialog', { name: 'Drafts not published yet' })
}
const ticked = (sheet: HTMLElement) => within(sheet).getAllByRole('checkbox').filter(box => box.getAttribute('aria-checked') === 'true')

describe('TRAK-154: the coach publishes every draft to come in one tap', { timeout: 20_000 }, () => {
  beforeEach(() => { signInAs(COACH); fixtures() })
  afterEach(() => vi.useRealTimers())

  it('counts only drafts still to come, and "Publish 3" publishes all three in one update', async () => {
    const sheet = await openReview()
    expect(screen.getByText('3 drafts not published yet')).toBeInTheDocument()

    // A past draft, a cancelled one and a published one are never listed.
    expect(within(sheet).getAllByRole('checkbox')).toHaveLength(3)
    expect(ticked(sheet)).toHaveLength(3)
    expect(within(sheet).queryByText('Old draft')).toBeNull()
    expect(within(sheet).queryByText('Cancelled draft')).toBeNull()
    expect(within(sheet).getByRole('group', { name: 'November 2099' })).toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'December 2099' })).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: 'Publish 3' }))
    expect(await screen.findByText('Published 3 events to the squad')).toBeInTheDocument()
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toEqual({ published: true })
    // Only drafts still scheduled change, whatever the screen believed.
    expect(patches[0].query).toContain('published=eq.false')
    expect(patches[0].query).toContain('status=eq.scheduled')
    expect(patches[0].query).toMatch(/id=in\.\("?d1"?,"?d2"?,"?d3"?\)/)
    await waitFor(() => expect(emailNudges).toBe(1))
  })

  it('an unticked draft stays a draft: "Publish 2" sends the other two only', async () => {
    const sheet = await openReview()
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Training B' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Publish 2' }))
    expect(await screen.findByText('Published 2 events to the squad')).toBeInTheDocument()
    expect(patches[0].query).toMatch(/id=in\.\("?d1"?,"?d3"?\)/)
  })

  it('a short answer says "Published 2 of 3", never "Published 3", and keeps the rest ticked', async () => {
    confirm = ids => ids.slice(0, 2)
    await userEvent.click(within(await openReview()).getByRole('button', { name: 'Publish 3' }))
    // The sheet opens again with what is left ticked.
    expect(await screen.findByText('Published 2 of 3. The rest are still drafts: tap Publish to try them again.')).toBeInTheDocument()
    const sheet = screen.getByRole('dialog', { name: 'Drafts not published yet' })
    expect(screen.queryByText('Published 3 events to the squad')).toBeNull()
    expect(within(sheet).getByRole('button', { name: 'Publish 1' })).toBeInTheDocument()
    expect(within(sheet).getByRole('checkbox', { name: 'Training C' })).toHaveAttribute('aria-checked', 'true')
  })

  it('with nothing confirmed, says nothing was published', async () => {
    confirm = () => []
    await userEvent.click(within(await openReview()).getByRole('button', { name: 'Publish 3' }))
    expect(await screen.findByText('Nothing was published. Check your connection and tap Publish again.')).toBeInTheDocument()
    expect(emailNudges).toBe(0)
  })

  it('shows no strip with events off for the academy', async () => {
    // The app keeps a switch's answer for 30 s, so this academy is another coach's.
    signInAs({ id: 'coach-154-off' })
    server.use(rpc('feature_on', () => false))
    renderApp('/coach/schedule')
    // The drafts were read (so the strip had its count), and still no strip.
    await waitFor(() => expect(reads).toBeGreaterThan(0))
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(screen.queryByText('3 drafts not published yet')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull()
  })

  it("after an import, Review and publish opens the sheet with only that import's fixtures ticked", async () => {
    const user = userEvent.setup({ applyAccept: false })
    await openEvents()
    await user.click(await screen.findByRole('button', { name: 'Import fixtures' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import fixtures' })
    await user.upload(within(dialog).getByLabelText(/choose a csv file/i), new File([[HEADER,
      '2099-11-08,10:00,,Al Wasl FC,Home,,', '2099-11-15,10:00,,Rivals FC,Away,,'].join('\n')], 'fixtures.csv', { type: 'text/csv' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add 2 fixtures' }))

    // By keyboard: a toast's button is reachable without a pointer (jsdom has no pointer capture for Sonner's swipe).
    const action = await screen.findByRole('button', { name: 'Review and publish' })
    action.focus()
    await user.keyboard('{Enter}')
    const sheet = await screen.findByRole('dialog', { name: 'Drafts not published yet' })
    expect(within(sheet).getByRole('checkbox', { name: 'vs Al Wasl FC' })).toHaveAttribute('aria-checked', 'true')
    expect(within(sheet).getByRole('checkbox', { name: 'vs Rivals FC' })).toHaveAttribute('aria-checked', 'true')
    expect(within(sheet).getByRole('checkbox', { name: 'Training A' })).toHaveAttribute('aria-checked', 'false')

    await user.click(within(sheet).getByRole('button', { name: 'Publish 2' }))
    expect(await screen.findByText('Published 2 events to the squad')).toBeInTheDocument()
    expect(patches[0].query).toMatch(/id=in\.\("?new-0"?,"?new-1"?\)/)
  })
})
