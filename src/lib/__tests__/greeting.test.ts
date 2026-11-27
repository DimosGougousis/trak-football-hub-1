import { describe, it, expect } from 'vitest'
import { greetingFor } from '../greeting'

// TRAK-616 (Kostas, 27 Nov): at night it said Good morning.
describe("Home's greeting by the hour", () => {
  it('evening from 18:00 through the night, morning from 05:00, afternoon from 12:00', () => {
    expect(greetingFor(0)).toBe('coachHome:greetEvening')
    expect(greetingFor(4)).toBe('coachHome:greetEvening')
    expect(greetingFor(5)).toBe('coachHome:greetMorning')
    expect(greetingFor(11)).toBe('coachHome:greetMorning')
    expect(greetingFor(12)).toBe('coachHome:greetAfternoon')
    expect(greetingFor(17)).toBe('coachHome:greetAfternoon')
    expect(greetingFor(18)).toBe('coachHome:greetEvening')
    expect(greetingFor(23)).toBe('coachHome:greetEvening')
  })
})
