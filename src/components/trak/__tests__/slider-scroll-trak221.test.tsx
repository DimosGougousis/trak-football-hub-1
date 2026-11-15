import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SliderInput } from '@/components/trak/SliderInput'

// TRAK-221 (20 Oct live run): a coach scrolling the assessment form with a
// finger that lands on a slider changed that rating. The row lets vertical
// pans scroll the page, but the slider jumped to the touched spot on finger
// down and kept it when the browser took the gesture for scrolling.
function setup(value = 5) {
  const onChange = vi.fn()
  // Stateful like the assessment form, so the slider sees each value it reports.
  function Form() {
    const [score, setScore] = useState(value)
    return <SliderInput label="Work Rate" value={score} onChange={next => { onChange(next); setScore(next) }} />
  }
  render(<Form />)
  const control = screen.getByRole('slider').closest<HTMLElement>('div[class*="control"]')!
  return { onChange, control }
}

// A 100 px track starting at x = 0, so clientX reads as a percentage.
const rect = { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0, toJSON: () => ({}) }
const touch = (x: number, y = 20) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y })

// jsdom has no PointerEvent, so fireEvent would drop clientX, button and pointerType.
class TestPointerEvent extends MouseEvent {
  pointerId: number; pointerType: string; isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'mouse'; this.isPrimary = init.isPrimary ?? true
  }
}

describe('TRAK-221: the assessment slider and a scrolling finger', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect)
    Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => false) })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('a vertical swipe that starts on the slider scrolls without changing the rating', () => {
    const { onChange, control } = setup(5)
    fireEvent.pointerDown(control, touch(85, 20))
    fireEvent.pointerMove(control, touch(86, 5))
    // The browser takes the pan for scrolling and cancels the pointer.
    fireEvent.pointerCancel(control, touch(86, 5))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a deliberate tap still sets the rating where the finger lands', () => {
    const { onChange, control } = setup(5)
    fireEvent.pointerDown(control, touch(30))
    fireEvent.pointerUp(control, touch(30))
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('a sideways drag still moves the rating, to the first and last bands too', () => {
    const { onChange, control } = setup(5)
    fireEvent.pointerDown(control, touch(50))
    fireEvent.pointerMove(control, touch(44, 21))
    fireEvent.pointerMove(control, touch(0, 22))
    fireEvent.pointerUp(control, touch(0, 22))
    expect(onChange).toHaveBeenLastCalledWith(0)
    onChange.mockClear()
    fireEvent.pointerDown(control, touch(50))
    fireEvent.pointerMove(control, touch(56, 21))
    fireEvent.pointerMove(control, touch(100, 22))
    fireEvent.pointerUp(control, touch(100, 22))
    expect(onChange).toHaveBeenLastCalledWith(10)
  })

  it('a drag the browser cancels puts the rating back where it started', () => {
    const { onChange, control } = setup(5)
    fireEvent.pointerDown(control, touch(50))
    fireEvent.pointerMove(control, touch(30, 21))
    fireEvent.pointerCancel(control, touch(30, 21))
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('a mouse press still moves the rating at once', () => {
    const { onChange, control } = setup(5)
    fireEvent.pointerDown(control, { ...touch(30), pointerType: 'mouse' })
    expect(onChange).toHaveBeenLastCalledWith(3)
  })
})
