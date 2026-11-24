import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LatestReport } from '../LatestEvaluation'
import { markOpened } from '@/lib/games/news'
import { server } from '../../../../tests/msw/server'
import { table, SUPABASE_URL } from '../../../../tests/msw/supabase'

/**
 * TRAK-441 slice 2.5, then TRAK-529 (Reports 6/10): Home's card is the latest report, for the player and the parent.
 * The coach's band bars on its report day, words and no numbers; "New" until the report's page has shown on this
 * device; Open report goes to it. No report yet, no card. Test people are footballers.
 */

const day = (id: string, report_day: string, attitude: number) => ({
  evaluation_id: id, sent_at: `${report_day}T18:00:00Z`,
  report: { squad_player_id: 'sq-1', player_name: 'Alessandro Nesta', squad: 'U16', season_starts_on: '2026-08-01',
    period_from: '2026-08-01', report_day, last_report_day: null, before_season: null, matches: [], objectives: [],
    trainings: { attended: 0, total: 0 },
    assessments: [{ id: `a-${id}`, day: report_day, work_rate: 9, technical: 7, physical: 7, coachability: 8, attitude, tactical: 7 }] },
})
let rows: Record<string, unknown>[] = []
const read: string[] = []

beforeEach(() => {
  localStorage.clear()
  read.length = 0
  rows = [day('ev-sep', '2026-09-27', 4), day('ev-oct', '2026-10-25', 8)]
  server.use(
    table('squad_players', [{ id: 'sq-1' }]),
    ...(['report_for_player', 'report_for_family'] as const).map(name => http.get(`${SUPABASE_URL}/rest/v1/${name}`, () => { read.push(name); return HttpResponse.json(rows) })),
  )
})
afterEach(cleanup)

let client: QueryClient
const show = (as: 'player' | 'parent' = 'player') => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>
    <MemoryRouter><LatestReport childId="nesta" readerId={as === 'player' ? 'nesta' : 'parent-1'} as={as} /></MemoryRouter>
  </QueryClientProvider>)
}

describe('TRAK-529: Latest report on Home', () => {
  it("shows October's report as the coach's bars with band words, never a number, and opens it", async () => {
    show()
    const card = await screen.findByRole('region', { name: 'Latest report' })
    expect(within(card).getByText('October')).toBeInTheDocument()
    for (const label of ['Work Rate', 'Tactical', 'Attitude', 'Technical', 'Physical', 'Coachability']) expect(within(card).getByText(label)).toBeInTheDocument()
    // October's Attitude (8) is Good; September's (4) would be Developing.
    expect(within(card).queryByText('Developing')).toBeNull()
    expect(card.textContent).not.toMatch(/\d/)
    expect(within(card).getByRole('link', { name: /Open report/ })).toHaveAttribute('href', '/player/report/ev-oct')
    expect(read).toEqual(['report_for_player'])
  })

  it("a parent's card opens the parent's report and reads only the parents' copy", async () => {
    show('parent')
    const card = await screen.findByRole('region', { name: 'Latest report' })
    expect(within(card).getByRole('link', { name: /Open report/ })).toHaveAttribute('href', '/parent/report/ev-oct')
    expect(read).toEqual(['report_for_family'])
  })

  it('says New until the report has been opened on this device', async () => {
    show()
    expect(within(await screen.findByRole('region', { name: 'Latest report' })).getByText('New')).toBeInTheDocument()
    cleanup()
    markOpened('nesta', 'nesta', 'report', 'ev-oct', Date.parse('2026-10-25T18:00:00Z'))
    show()
    expect(within(await screen.findByRole('region', { name: 'Latest report' })).queryByText('New')).toBeNull()
  })

  it('no report yet, no card', async () => {
    rows = []
    const { container } = show()
    // Read and answered: nothing, rather than a card still loading.
    await waitFor(() => expect(client.getQueryCache().getAll().every(query => query.state.status === 'success')).toBe(true))
    expect(read).toEqual(['report_for_player'])
    expect(container).toBeEmptyDOMElement()
  })
})
