import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Calendar } from '../calendar'
import { DatePicker } from '../../date-picker/date-picker'

/**
 * TRAK-256 (Tarek, 22 Oct). At the end of October the month showed 1–8
 * November like 1–8 October, and the month picker opened on this month and
 * the eleven after it, so September seemed out of reach. Another month's days
 * are now marked (a shaded cell, the month's name on its first day), and the
 * picker opens on the five months before the shown one and the six after,
 * so earlier months are there and March 2027 is still two taps (TRAK-157).
 */

const day = (key: string) => document.querySelector(`[data-present] [data-date="${key}"]`) as HTMLElement

describe('TRAK-256: another month\'s days', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T09:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('marks the days before and after the month, and names each month on its first shown day', () => {
    render(<Calendar locale="en-GB" month={new Date(2026, 9, 1)} value={new Date(2026, 9, 24)} />)
    // October 2026 starts on a Thursday: the grid opens on Mon 28 Sep and ends on Sun 8 Nov.
    expect(day('2026-09-28')).toHaveAttribute('data-outside')
    expect(day('2026-11-01')).toHaveAttribute('data-outside')
    expect(day('2026-11-08')).toHaveAttribute('data-outside')
    expect(day('2026-10-01')).not.toHaveAttribute('data-outside')
    expect(day('2026-10-31')).not.toHaveAttribute('data-outside')

    const label = (key: string) => day(key).querySelector('[data-month-label]')?.textContent ?? null
    expect(label('2026-09-28')).toBe('Sept') // en-GB, as in the month picker
    expect(label('2026-11-01')).toBe('Nov')
    expect(label('2026-09-29')).toBeNull()
    expect(label('2026-11-02')).toBeNull()
    expect(label('2026-10-01')).toBeNull()
    // The label is for the eye; the button already says the full date.
    expect(day('2026-11-01').querySelector('[data-month-label]')).toHaveAttribute('aria-hidden', 'true')
    expect(day('2026-11-01')).toHaveAccessibleName(/^Sunday,? 1 November 2026/)
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
