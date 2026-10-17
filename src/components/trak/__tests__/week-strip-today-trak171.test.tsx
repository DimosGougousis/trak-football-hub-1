import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WeekStrip } from '../WeekStrip'

/**
 * TRAK-171, live run 3 (16 Oct, Tarek): after tapping another day in the week
 * strip, nothing showed which day is today ("Sunday 18th… do you know what day
 * it is?"). Today stays marked, for the eye and for a screen reader.
 */
describe('TRAK-171: the week strip always marks today', () => {
  it('keeps today marked after another day is picked', async () => {
    const today = new Date(2026, 9, 16, 12) // Friday 16 October
    render(<WeekStrip events={[]} renderSheet={(_event, trigger) => trigger} today={today} />)
    const strip = screen.getByRole('group', { name: 'This week' })
    await userEvent.click(within(strip).getByRole('button', { name: /Sunday 18 October/ }))
    expect(within(strip).getByRole('button', { name: /Sunday 18 October/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(strip).getByRole('button', { name: /Friday 16 October, today/ })).toHaveAttribute('aria-pressed', 'false')
    expect(within(strip).getAllByRole('button', { name: /today/ })).toHaveLength(1)
  })
})
