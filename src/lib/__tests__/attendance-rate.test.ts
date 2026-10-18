import { describe, expect, it } from 'vitest'
import { trainingAttendance } from '@/lib/attendance-rate'

// TRAK-182 (Imad, 18 Oct; pilot coach's item 15): a player's training attendance
// for the coach: recorded trainings of their squad since they joined, and how many they came to.
const training = (n: number, extra: { squad?: string | null; session_date?: string } = {}) =>
  ({ id: `s${n}`, squad: null, session_date: `2026-10-${String(n).padStart(2, '0')}`, ...extra })

describe('trainingAttendance', () => {
  it('7 of 10 recorded trainings is 70%', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => training(i + 1))
    expect(trainingAttendance(sessions, ['s1', 's2', 's3', 's4', 's5', 's6', 's7'], { joined: '2026-09-01', ageGroup: 'U14' }))
      .toEqual({ attended: 7, total: 10, percent: 70 })
  })
  it('counts only trainings since the player joined', () => {
    expect(trainingAttendance([training(1), training(2), training(3)], ['s3'], { joined: '2026-10-02T09:00:00Z', ageGroup: null }))
      .toEqual({ attended: 1, total: 2, percent: 50 })
  })
  it("leaves out the other squad's trainings, keeps whole-roster ones", () => {
    const sessions = [training(1, { squad: 'U14' }), training(2, { squad: 'U16' }), training(3)]
    expect(trainingAttendance(sessions, ['s1', 's2'], { joined: '2026-09-01', ageGroup: 'U14' }))
      .toEqual({ attended: 1, total: 2, percent: 50 })
  })
  it('no recorded training gives no percentage, never 0%', () => {
    expect(trainingAttendance([], [], { joined: '2026-09-01', ageGroup: 'U14' })).toBeNull()
  })
  it('rounds to a whole percent', () => {
    expect(trainingAttendance([training(1), training(2), training(3)], ['s1', 's2'], { joined: '2026-09-01', ageGroup: null }))
      .toEqual({ attended: 2, total: 3, percent: 67 })
  })
})
