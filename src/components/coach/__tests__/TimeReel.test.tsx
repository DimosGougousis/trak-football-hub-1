import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeReel } from '@/components/coach/TimeReel'
import { localTodayISO } from '@/lib/event-time'

/**
 * TRAK-157 (J8.4): the coach's date and time wheel, after a half-entered
 * <input type="time"> saved 8 trainings with no time (11 Oct live run). Every
 * column always holds a whole value, so the time is either picked whole or not
 * picked at all; it can't be half-entered. In the browser the columns roll and
 * snap; here each row is tapped, which the wheel also supports.
 */

function Harness({ initialDate = localTodayISO(), initialTime = '', withDate = true, dateLocked = false, disabled = false }: {
  initialDate?: string, initialTime?: string, withDate?: boolean, dateLocked?: boolean, disabled?: boolean,
}) {
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  return (
    <>
      <TimeReel label="Start" time={time} onTimeChange={setTime} disabled={disabled}
        {...(withDate ? { date, onDateChange: setDate, dateLocked } : {})} />
      <output aria-label="value">{date} {time || '(none)'}</output>
    </>
  )
}

const value = () => screen.getByLabelText('value').textContent
const column = (name: string) => screen.getByRole('listbox', { name })
const pick = (col: string, option: string) => userEvent.click(within(column(col)).getByRole('option', { name: option }))
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('TRAK-157: the date and time wheel', () => {
  it('has day, hour, minute and AM/PM columns, and nothing chosen until the coach picks', () => {
    render(<Harness />)
    for (const name of ['Start day', 'Start hour', 'Start minute', 'Start AM or PM']) expect(column(name)).toBeInTheDocument()
    expect(screen.getByText('Pick a time')).toBeInTheDocument()
    expect(value()).toMatch(/\(none\)$/)
  })

  it('6, 00, PM is 18:00, and the heading says it in words', async () => {
    render(<Harness initialDate="2026-10-20" />)
    await pick('Start hour', '6')
    await pick('Start minute', '00')
    await pick('Start AM or PM', 'PM')
    expect(value()).toBe('2026-10-20 18:00')
    expect(screen.getByText('Tue 20 Oct at 6:00 PM')).toBeInTheDocument()
  })

  it('a first tap on any column gives a whole time at once, never a half one', async () => {
    render(<Harness initialDate="2026-10-20" />)
    await pick('Start minute', '30')
    expect(value()).toMatch(/ \d{2}:30$/)
  })

  it('12 AM is midnight and 12 PM is noon', async () => {
    render(<Harness initialTime="18:00" />)
    await pick('Start hour', '12')
    expect(value()).toMatch(/ 12:00$/)
    await pick('Start AM or PM', 'AM')
    expect(value()).toMatch(/ 00:00$/)
  })

  it('minutes come in 5s, and a saved time off the 5s keeps its minute', () => {
    render(<Harness initialTime="18:07" />)
    const minutes = within(column('Start minute')).getAllByRole('option').map(o => o.textContent)
    expect(minutes).toContain('05')
    expect(minutes).toContain('07')
    expect(minutes).not.toContain('06')
    expect(within(column('Start minute')).getByRole('option', { name: '07' })).toHaveAttribute('aria-selected', 'true')
  })

  it('the day column says Today and Tomorrow, and picks a day', async () => {
    const today = localTodayISO()
    render(<Harness initialDate={today} initialTime="18:00" />)
    expect(within(column('Start day')).getByRole('option', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
    await pick('Start day', 'Tomorrow')
    expect(value()).toBe(`${addDays(today, 1)} 18:00`)
  })

  it('a locked day can\'t change ("this and following weeks" keep their own dates)', async () => {
    const today = localTodayISO()
    render(<Harness initialDate={today} initialTime="18:00" dateLocked />)
    await pick('Start day', 'Tomorrow')
    expect(value()).toBe(`${today} 18:00`)
  })

  it('switched off for "Time not set yet": the time columns don\'t change it', async () => {
    render(<Harness initialDate="2026-10-20" disabled />)
    await pick('Start hour', '6')
    expect(value()).toBe('2026-10-20 (none)')
  })

  it('without a day (the meet time) it is just the time', () => {
    render(<Harness withDate={false} />)
    expect(screen.queryByRole('listbox', { name: 'Start day' })).toBeNull()
    expect(column('Start hour')).toBeInTheDocument()
  })
})
