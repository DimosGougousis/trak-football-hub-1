import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from '../../date-picker/date-picker'

/**
 * TRAK-157, live run 3 (16 Oct): the date picker only stepped one month at a
 * time, so an event in March 2027 took five taps on →. The month title now
 * opens twelve months, each with its year: March 2027 is two taps.
 */

function Field({ min, max }: { min?: Date; max?: Date }) {
  const [value, setValue] = useState<Date | undefined>(new Date(2026, 9, 17))
  return <DatePicker label="Date" value={value} onChange={setValue} minDate={min} maxDate={max} clearable={false} locale="en-GB" />
}

describe('TRAK-157: month and year in two taps', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T09:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('reaches March 2027 from October 2026 with the title and one month tap', async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.click(screen.getByRole('button', { name: /^Date\b/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Date calendar' })
    const taps = { count: 0 }
    const tap = async (el: Element) => { taps.count++; await user.click(el) }
    await tap(within(dialog).getByRole('button', { name: 'October 2026, choose month and year' }))
    await tap(within(dialog).getByRole('button', { name: 'March 2027' }))
    expect(taps.count).toBe(2)
    expect(within(dialog).getByRole('grid', { name: 'March 2027' })).toBeInTheDocument()
    // Picking the day is the same as ever.
    await user.click(dialog.querySelector('[data-present] [data-date="2027-03-12"]') as HTMLElement)
    expect(screen.getByRole('button', { name: /^Date\b/ })).toHaveTextContent('12 Mar 2027')
  })

  it('pages twelve months at a time, and months outside the allowed range cannot be picked', async () => {
    const user = userEvent.setup()
    render(<Field max={new Date(2026, 9, 17)} />)
    await user.click(screen.getByRole('button', { name: /^Date\b/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Date calendar' })
    await user.click(within(dialog).getByRole('button', { name: /choose month and year/ }))
    expect(within(dialog).getByRole('button', { name: 'November 2026' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Earlier months' }))
    await user.click(within(dialog).getByRole('button', { name: 'March 2026' }))
    expect(within(dialog).getByRole('grid', { name: 'March 2026' })).toBeInTheDocument()
  })

  // #336 review: paging moves a whole year each way, not one month.
  // TRAK-256: the twelve start five months before the shown one (May for October).
  it('Later and Earlier months each move exactly twelve months', async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.click(screen.getByRole('button', { name: /^Date\b/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Date calendar' })
    await user.click(within(dialog).getByRole('button', { name: /choose month and year/ }))
    const months = () => within(within(dialog).getByRole('group', { name: 'Choose a month' })).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(months()[0]).toBe('May 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Later months' }))
    expect(months()).toHaveLength(12)
    expect([months()[0], months()[11]]).toEqual(['May 2027', 'April 2028'])
    await user.click(within(dialog).getByRole('button', { name: 'Earlier months' }))
    await user.click(within(dialog).getByRole('button', { name: 'Earlier months' }))
    expect([months()[0], months()[11]]).toEqual(['May 2025', 'April 2026'])
  })
})
