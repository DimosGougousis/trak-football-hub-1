/** Design standard step 3: a player's page, its name a card title, its parts labelled in the standard style. */
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

describe("a player's page in the standard style", () => {
  it("the player's name is a card title", () => {
    renderWaiting()
    const name = screen.getByRole('heading', { level: 3, name: 'Ada Synthetic' })
    expect(name.className).toContain('text-xl')
    expect(name.className).toContain('font-bold')
    expect(name.className).toContain('tracking-[-0.01em]')
  })

  it('a waiting player shows a needs pill, then says why', () => {
    renderWaiting()
    expect(screen.getByText('Waiting for consent').getAttribute('data-tone')).toBe('needs')
    expect(screen.getByText(/Ada/, { selector: 'p' })).toBeInTheDocument()
  })

  it("the page's sections are labelled in the standard style", () => {
    const source = readFileSync(join(__dirname, '..', 'PlayerProfile.tsx'), 'utf8')
    expect(source).toContain("import { SECTION_LABEL } from '@/components/trak/standard'")
    expect(source).toContain('const TITLE = SECTION_LABEL')
  })
})
