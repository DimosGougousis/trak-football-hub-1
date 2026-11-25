/** A player's page in the season plan's pitch-ready look (Dimos, 25 Nov): its name a black title, its parts labelled as the season plan's. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlayerProfile } from '@/components/coach/squad/PlayerProfile'

afterEach(cleanup)

const waiting = { id: 'p1', name: 'Ada Synthetic', position: 'Midfielder', group: 'MID' as const, shirt: 8, band: null, move: 0 as const, waiting: true }
const renderWaiting = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
  <PlayerProfile player={waiting} squad="U16" coachId="coach-1" facts={undefined} factsFailed={false} onRetryFacts={() => {}} />
</MemoryRouter></QueryClientProvider>)

describe("a player's page in the season plan's look", () => {
  it("the player's name is a black title, with the shirt number on the face and position and squad as badges", () => {
    renderWaiting()
    const name = screen.getByRole('heading', { level: 3, name: 'Ada Synthetic' })
    expect(name).toHaveClass('font-black', 'text-2xl')
    expect(screen.getByText('8')).toHaveTextContent('Shirt number 8')
    expect(screen.getByText('Midfielder')).toBeInTheDocument()
    expect(screen.getByText('U16')).toBeInTheDocument()
  })

  it('a waiting player shows a needs pill, then says why', () => {
    renderWaiting()
    expect(screen.getByText('Waiting for consent').getAttribute('data-tone')).toBe('needs')
    expect(screen.getByText(/Ada/, { selector: 'p' })).toBeInTheDocument()
  })

  it("the page's sections are labelled as the season plan's", () => {
    const source = readFileSync(join(__dirname, '..', 'PlayerProfile.tsx'), 'utf8')
    expect(source).toContain("from '@/components/coach/pitch-ready'")
    expect(source).toContain('const TITLE = SECTION_TITLE')
  })
})
