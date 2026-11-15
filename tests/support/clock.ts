import { vi } from 'vitest'

/**
 * TRAK-230: a started event can't be edited or cancelled, so a test of editing
 * "today's 18:00 training" fails once the real clock passes 18:00. Pin Date (only
 * Date: animation timers stay real) to this morning, before any of today's
 * fixtures start. Pair with vi.useRealTimers() in afterEach.
 */
export function atMorningToday(hour = 9) {
  const morning = new Date()
  morning.setHours(hour, 0, 0, 0)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(morning)
}
