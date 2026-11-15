import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from '../date-picker'
import { TimePicker } from '../../time-picker/time-picker'

/**
 * TRAK-227 (20 Oct live run, S1): the event form's date field sits low on a
 * phone, and its calendar always opened downward, over Next, so the coach had
 * to scroll to go on. It opens on the side with room: downward from a field
 * near the top, upward from one near the bottom of what's visible.
 */

const VIEWPORT = 844
function fieldAt(top: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { top, bottom: top + 44, left: 16, right: 374, width: 358, height: 44, x: 16, y: top, toJSON: () => ({}) } as DOMRect)
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT })
}
async function openPicker() {
  render(<DatePicker label="Date" value={new Date(2026, 9, 21)} onChange={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /Date/ }))
  return screen.findByRole('dialog', { name: 'Date calendar' })
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('TRAK-227: the date calendar opens where there is room', () => {
  it('downward from a field near the top of the screen', async () => {
    fieldAt(120)
    expect((await openPicker()).dataset.side).toBe('bottom')
  })

  it('upward from a field near the bottom, so Next stays in view', async () => {
    fieldAt(VIEWPORT - 180)
    expect((await openPicker()).dataset.side).toBe('top')
  })

  it('downward when neither side has room but below has more', async () => {
    fieldAt(300)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })
    expect((await openPicker()).dataset.side).toBe('bottom')
  })

  it('measures the visible screen: a phone keyboard shrinks it', async () => {
    fieldAt(400)
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 480, offsetTop: 0, addEventListener() {}, removeEventListener() {} } })
    try {
      expect((await openPicker()).dataset.side).toBe('top')
    } finally {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    }
  })
})

describe('TRAK-227: the time list opens where there is room too', () => {
  async function openTimes() {
    render(<TimePicker label="Start" value="17:00" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Start/ }))
    return screen.findByRole('listbox', { name: 'Start options' })
  }
  it('downward from a field near the top', async () => {
    fieldAt(150)
    expect((await openTimes()).dataset.side).toBe('bottom')
  })
  it('upward from a field near the bottom', async () => {
    fieldAt(VIEWPORT - 120)
    expect((await openTimes()).dataset.side).toBe('top')
  })
})
