import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { trainingEnded, useTrainingEnded } from '../ended'

// TRAK-493 (Imad, 19 Nov): a training from Mon 17 Nov still said "Started". During a training it is "Started";
// once it is over, "Finished".
const training = { id: 't-1', starts_at: '2026-11-17T14:00:00Z', ends_at: '2026-11-17T15:30:00Z', start_time: '18:00:00' }
const at = (iso: string) => Date.parse(iso)

describe('TRAK-493: a training is over at its end', () => {
  it('not before it starts, not while it runs; over from its end, days later too', () => {
    expect(trainingEnded(training, at('2026-11-17T13:00:00Z'))).toBe(false)
    expect(trainingEnded(training, at('2026-11-17T15:00:00Z'))).toBe(false)
    expect(trainingEnded(training, at('2026-11-17T15:30:00Z'))).toBe(true)
    expect(trainingEnded(training, at('2026-11-20T09:00:00Z'))).toBe(true)
  })

  it('with no end saved, a timed training is over 90 minutes after its start', () => {
    const open = { ...training, ends_at: null }
    expect(trainingEnded(open, at('2026-11-17T15:29:00Z'))).toBe(false)
    expect(trainingEnded(open, at('2026-11-17T15:30:00Z'))).toBe(true)
  })
})

describe('TRAK-493: an open page turns to "Finished" at the end', () => {
  afterEach(() => { vi.useRealTimers() })

  it('false during the training, true once its end passes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-11-17T15:00:00Z'))
    const { result } = renderHook(() => useTrainingEnded(training))
    expect(result.current).toBe(false)
    act(() => { vi.advanceTimersByTime(31 * 60_000) })
    expect(result.current).toBe(true)
  })
})
