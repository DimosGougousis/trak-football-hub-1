import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Calendar } from '../calendar'
import { DatePicker } from '../../date-picker/date-picker'

/**
 * TRAK-256 (Tarek, 22 Oct): the month picker opened on this month and the
 * eleven after it, so September seemed out of reach. It now opens on the five
 * months before the shown one and the six after (TRAK-157 keeps March 2027 two taps away).
 * TRAK-504 (Imad, 19 Nov): a month shows only its own days. TRAK-256 had marked
 * another month's days (a shaded cell, the month's name); they are now blank cells,
 * so the days still sit under their weekdays.
 */

const day = (key: string) => document.querySelector(`[data-present] [data-date="${key}"]`) as HTMLElement | null

describe('TRAK-504: a month shows only its own days', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-20T09:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('shows no October or December day in November, and the 1st still sits under its weekday', () => {
    render(<Calendar locale="en-GB" month={new Date(2026, 10, 1)} value={new Date(2026, 10, 20)} />)
    const grid = screen.getByRole('grid', { name: 'November 2026' })
    // November 2026 starts on a Sunday: six blank cells, Monday to Saturday, before the 1st.
    expect(day('2026-10-26')).toBeNull()
    expect(day('2026-10-31')).toBeNull()
    expect(day('2026-12-01')).toBeNull()
    expect(day('2026-11-01')).not.toBeNull()
    expect(day('2026-11-30')).not.toBeNull()
    const firstWeek = within(grid).getAllByRole('row')[0]
    const cells = within(firstWeek).getAllByRole('gridcell')
    expect(cells).toHaveLength(7)
    expect(cells.slice(0, 6).every(cell => cell.textContent === '' && cell.tagName === 'SPAN')).toBe(true)
    expect(cells[6]).toBe(day('2026-11-01'))
    expect(day('2026-11-01')).toHaveAccessibleName(/^Sunday,? 1 November 2026/)
    // Only November's 30 days are buttons.
    expect(within(grid).getAllByRole('gridcell').filter(cell => cell.tagName === 'BUTTON')).toHaveLength(30)
  })

  it('the month arrows still move a month, and the next month shows only its own days', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<Calendar locale="en-GB" value={new Date(2026, 10, 20)} />)
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    const december = await screen.findByRole('grid', { name: 'December 2026' })
    expect(within(december).getAllByRole('gridcell').filter(cell => cell.tagName === 'BUTTON')).toHaveLength(31)
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByRole('grid', { name: 'November 2026' })).toBeInTheDocument()
  })
})

function Field({ max }: { max?: Date }) {
  const [value, setValue] = useState<Date | undefined>(new Date(2026, 9, 22))
  return <DatePicker label="Date" value={value} onChange={setValue} maxDate={max} clearable={false} locale="en-GB" />
}

describe('TRAK-256: the month picker shows earlier months too', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T09:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  const open = async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.click(screen.getByRole('button', { name: /^Date\b/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Date calendar' })
    await user.click(within(dialog).getByRole('button', { name: 'October 2026, choose month and year' }))
    const months = () => within(within(dialog).getByRole('group', { name: 'Choose a month' })).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    return { user, dialog, months }
  }

  it('opens on the five months before October and the six after', async () => {
    const { months } = await open()
    expect(months()).toEqual([
      'May 2026', 'June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026',
      'November 2026', 'December 2026', 'January 2027', 'February 2027', 'March 2027', 'April 2027',
    ])
  })

  it('September is one tap away', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('button', { name: 'September 2026' }))
    expect(within(dialog).getByRole('grid', { name: 'September 2026' })).toBeInTheDocument()
  })
})
