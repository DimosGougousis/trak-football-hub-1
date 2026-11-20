import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { PlanReview } from '../plan-review'

// TRAK-521 (Imad, 20 Nov): on Review and share, "Starts in" sat over "● Started" once the training had begun.
// Before the start the countdown keeps its "Starts in"; once it has run out, the finished label stands alone.
const review = (end: string, completeLabel = 'Started') => render(
  <PlanReview title="Training plan review" rows={[{ id: 'logistics', label: 'Logistics', status: 'good' }]}
    band={{ status: 'good', label: 'Ready' }} countdown={{ label: 'Starts in', end, completeLabel }} />)

describe('TRAK-521: Review and share once the training has started', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('before the start: "Starts in" over the countdown', () => {
    review(new Date(Date.now() + 2 * 3600_000).toISOString())
    expect(screen.getByText('Starts in')).toBeInTheDocument()
  })

  it('after the start: no "Starts in", only the finished label', () => {
    review(new Date(Date.now() - 30 * 60_000).toISOString())
    expect(screen.queryByText('Starts in')).toBeNull()
  })

  it('an open page drops "Starts in" when the countdown runs out', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    review(new Date(Date.now() + 3000).toISOString())
    expect(screen.getByText('Starts in')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('Starts in')).toBeNull()
  })
})
