import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NeedsYou, type OwedEvent } from '@/components/coach/home/NeedsYou'

/**
 * TRAK-506 (Imad, 20 Nov): Needs you is one row that scrolls. A laptop shows four whole cards and the fifth cut at
 * about 30% (checked on screenshots; jsdom has no layout), "See all" sits at the end of the row and opens every card,
 * and four cards or fewer get no "See all".
 */
afterEach(cleanup)

const event = (n: number): OwedEvent => ({ id: `e${n}`, title: `Event ${n}`, when: '', squad: null, reason: 'Log it', action: <span />, at: n })
const show = (n: number) => render(<NeedsYou items={[]} events={Array.from({ length: n }, (_, i) => event(i + 1))} failed={false} onRetry={() => {}} onOpen={() => {}} />)
const cards = () => within(screen.getByRole('list')).getAllByRole('listitem')

describe('TRAK-506: Needs you as one row', () => {
  it('has no See all with four cards', () => {
    show(4)
    expect(cards()).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull()
  })

  it('puts See all at the end of the row from five cards', () => {
    show(5)
    const row = screen.getByRole('region', { name: 'What needs you' })
    expect(within(row).getByRole('button', { name: 'See all 5' })).toBeInTheDocument()
  })

  it('See all opens every card, wrapped into a grid, and Show fewer goes back to the row', async () => {
    show(9)
    expect(cards()).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: 'See all 9' }))
    expect(cards()).toHaveLength(9)
    expect(screen.getByRole('list')).toHaveClass('grid')
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(cards()).toHaveLength(5)
  })
})
