import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Calendar } from '../calendar'

/**
 * Dimos, 29 Oct: Schedule shows this week on the top row and the four weeks
 * after it, not the calendar month, so the end of October no longer hides
 * November. The arrows move four weeks: the last row becomes the top one.
 */

const shown = () => [...document.querySelectorAll<HTMLElement>('[data-present] [data-date]')].map(day => day.dataset.date!)
const rows = () => within(document.querySelector('[data-present] [role="grid"]') as HTMLElement).getAllByRole('row')

function Rolling({ start = new Date(2026, 9, 29) }: { start?: Date }) {
  const [value, setValue] = useState(start)
  const [month, setMonth] = useState(start)
  return <Calendar locale="en-GB" showToday weeks={5} value={value} onChange={setValue} month={month} onMonthChange={setMonth} />
}

describe('a rolling window of weeks', () => {
  // Thursday 29 October 2026.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-29T09:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('opens on this week and the four after it, every day in full colour', () => {
    render(<Rolling />)
    expect(rows()).toHaveLength(5)
    const days = shown()
    expect(days[0]).toBe('2026-10-26')
    expect(days.at(-1)).toBe('2026-11-29')
    expect(document.querySelector('[data-present] [data-outside]')).toBeNull()
    expect(screen.getByRole('grid', { name: /^26 Oct\s*–\s*29 Nov 2026$/ })).toBeInTheDocument()
  })

  it('names each month on the first day shown and on the 1st', () => {
    render(<Rolling />)
    const label = (key: string) => document.querySelector(`[data-present] [data-date="${key}"] [data-month-label]`)?.textContent ?? null
    expect(label('2026-10-26')).toBe('Oct')
    expect(label('2026-11-01')).toBe('Nov')
    expect(label('2026-10-27')).toBeNull()
    expect(label('2026-11-02')).toBeNull()
  })

  it('moves four weeks at a time, so the last week shown becomes the top one, and Today comes back', async () => {
    const user = userEvent.setup()
    render(<Rolling />)
    await user.click(screen.getByRole('button', { name: 'Next weeks' }))
    expect(shown()[0]).toBe('2026-11-23')
    expect(shown().at(-1)).toBe('2026-12-27')
    await user.click(screen.getByRole('button', { name: 'Previous weeks' }))
    await user.click(screen.getByRole('button', { name: 'Previous weeks' }))
    expect(shown()[0]).toBe('2026-09-28')
    await user.click(screen.getByRole('button', { name: /^Today/ }))
    expect(shown()[0]).toBe('2026-10-26')
  })

  it('a date further away opens the window it falls in, counted from this week', () => {
    render(<Rolling start={new Date(2027, 2, 10)} />)
    // 26 Oct plus 4 × 4 weeks is 15 Feb; plus another 4 is 15 Mar, so 10 March sits in the window from 15 Feb.
    expect(shown()[0]).toBe('2027-02-15')
    expect(shown()).toContain('2027-03-10')
  })

  it('the arrow keys carry on past the bottom row', async () => {
    const user = userEvent.setup()
    render(<Rolling />)
    ;(document.querySelector('[data-present] [data-date="2026-11-29"]') as HTMLElement).focus()
    await user.keyboard('{ArrowDown}')
    expect(shown()[0]).toBe('2026-11-23')
    expect(document.activeElement).toHaveAttribute('data-date', '2026-12-06')
  })

  it('the title picks a month, with that month in the middle of the window', async () => {
    const user = userEvent.setup()
    render(<Rolling />)
    await user.click(screen.getByRole('button', { name: /choose month and year$/ }))
    await user.click(screen.getByRole('button', { name: 'January 2027' }))
    expect(shown()).toContain('2027-01-15')
    expect(shown()[0]).toBe('2026-12-21')
  })
})
