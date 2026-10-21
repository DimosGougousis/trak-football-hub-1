import { describe, expect, it } from 'vitest'
import { trainingAttendance } from '@/lib/attendance-rate'

// TRAK-182 (Imad, 18 Oct; pilot coach's item 15): a player's training attendance
// for the coach, on the same rules as the Feedback and assessment tab (TRAK-197, TRAK-211).
const ME = 'sp-me'
const training = (n: number, extra: { squad?: string | null } = {}) =>
  ({ id: `s${n}`, squad: null, session_date: `2026-10-${String(n).padStart(2, '0')}`, ...extra })
/** Every listed session had its register taken (a teammate was ticked); `mine` also ticks me. */
const ticks = (sessions: { id: string }[], mine: string[]) =>
  new Map(sessions.map(s => [s.id, new Set(['sp-mate', ...(mine.includes(s.id) ? [ME] : [])])]))
const player = (extra: Partial<{ joined: string; ageGroup: string | null }> = {}) =>
  ({ id: ME, joined: '2026-09-01T00:00:00Z', ageGroup: 'U14', ...extra })

describe('trainingAttendance', () => {
  it('7 of 10 trainings is 70%', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => training(i + 1))
    expect(trainingAttendance(sessions, ticks(sessions, ['s1', 's2', 's3', 's4', 's5', 's6', 's7']), player()))
      .toEqual({ attended: 7, total: 10, percent: 70 })
  })
  it('counts only trainings from the day the player joined', () => {
    const sessions = [training(1), training(2), training(3)]
    expect(trainingAttendance(sessions, ticks(sessions, ['s3']), player({ joined: '2026-10-02T09:00:00Z' })))
      .toEqual({ attended: 1, total: 2, percent: 50 })
  })
  it("leaves out the other squad's trainings, keeps whole-roster ones", () => {
    const sessions = [training(1, { squad: 'U14' }), training(2, { squad: 'U16' }), training(3)]
    expect(trainingAttendance(sessions, ticks(sessions, ['s1', 's2']), player()))
      .toEqual({ attended: 1, total: 2, percent: 50 })
  })
  it('a training whose register was never taken (nobody ticked) does not count', () => {
    const sessions = [training(1), training(2)]
    const present = new Map([['s1', new Set([ME])]])
    expect(trainingAttendance(sessions, present, player())).toEqual({ attended: 1, total: 1, percent: 100 })
  })
  it('no counted training gives no percentage, never 0%', () => {
    expect(trainingAttendance([], new Map(), player())).toBeNull()
  })
  it('rounds to a whole percent', () => {
    const sessions = [training(1), training(2), training(3)]
    expect(trainingAttendance(sessions, ticks(sessions, ['s1', 's2']), player())).toEqual({ attended: 2, total: 3, percent: 67 })
  })
})
