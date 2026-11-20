import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Button } from '@/components/arc/button/button'
import { ShareEventButton } from '@/components/coach/ShareEventButton'
import { MatchAction } from '@/components/coach/games/MatchAction'
import { NEXT_STEP_SIZE, NEXT_STEP_WIDTH } from '@/components/coach/next-step'

// TRAK-497 (Imad, 19 and 20 Nov): Take register, Evaluate, Share, Publish and the other next steps are one height, one
// minimum width and one shape, and green. Evaluate keeps its arrow menu.
const stepLook = () => {
  const { unmount } = render(<Button size={NEXT_STEP_SIZE} className={NEXT_STEP_WIDTH}>x</Button>)
  const classes = screen.getByRole('button', { name: 'x' }).className
  unmount()
  return classes
}

describe('TRAK-497: one next-step button', () => {
  afterEach(cleanup)

  it('the medium Arc button, at least 128 px wide', () => {
    expect(NEXT_STEP_SIZE).toBe('md')
    expect(NEXT_STEP_WIDTH).toBe('min-w-[128px]')
  })

  it("Share as a next step is that green button, not a pill of its own", () => {
    const look = stepLook()
    render(<ShareEventButton arc="next-step" text="Training on Saturday">Share</ShareEventButton>)
    expect(screen.getByRole('button', { name: 'Share' }).className).toBe(look)
  })

  it("Share elsewhere stays the pop-up's secondary button", () => {
    render(<ShareEventButton arc text="Training on Saturday">Share</ShareEventButton>)
    expect(screen.getByRole('button', { name: 'Share' }).className).not.toBe(stepLook())
  })

  it('Evaluate is as wide as the others at least, and keeps its arrow menu', () => {
    render(<MemoryRouter><MatchAction state="fullTime" eventId="m-1" /></MemoryRouter>)
    const more = screen.getByRole('button', { name: /more actions$/ })
    expect(more.parentElement!.className).toContain(NEXT_STEP_WIDTH)
    expect(more.parentElement!.querySelector('button')!.textContent).toContain('Evaluate')
  })
})
