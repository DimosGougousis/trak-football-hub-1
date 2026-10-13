import { describe, it, expect } from 'vitest'
import { teamAssistsViolation, teamGoalsViolation } from '../match-input-rules'

// TRAK-66 (use-case test, 25 Sep): a 1–0 win saved with two scorers.
describe('teamGoalsViolation: our players cannot outscore the team', () => {
  it.each([
    [[1, 1], 1, '2 goals entered, but the team scored 1'],
    [[2, 1], 2, '3 goals entered, but the team scored 2'],
  ])('refuses goals %j when the team scored %i', (goals, teamScore, message) => {
    expect(teamGoalsViolation(goals, teamScore)).toBe(message)
  })

  it.each([
    [[1, 1], 2],   // exactly the score
    [[1], 2],      // fewer: an own goal or an unrostered scorer
    [[], 0],       // nobody scored
    [[0, 0], 0],
  ])('allows goals %j when the team scored %i', (goals, teamScore) => {
    expect(teamGoalsViolation(goals, teamScore)).toBeNull()
  })

  it('does not judge before the score is entered', () => {
    expect(teamGoalsViolation([3], undefined)).toBeNull()
  })
})

// TRAK-167 (J8 live run 2, S11): a 1–0 saved with five assists.
describe('teamAssistsViolation: each goal has at most one assist', () => {
  it.each([
    [[5], 1, '5 assists entered, but the team scored 1'],
    [[1, 1], 1, '2 assists entered, but the team scored 1'],
    [[1], 0, '1 assist entered, but the team scored 0'],
  ])('refuses assists %j when the team scored %i', (assists, teamScore, message) => {
    expect(teamAssistsViolation(assists, teamScore)).toBe(message)
  })

  it.each([
    [[1], 1],      // exactly the score
    [[], 2],       // fewer: a goal with no assist
    [[0, 0], 0],
  ])('allows assists %j when the team scored %i', (assists, teamScore) => {
    expect(teamAssistsViolation(assists, teamScore)).toBeNull()
  })

  it('does not judge before the score is entered', () => {
    expect(teamAssistsViolation([3], undefined)).toBeNull()
  })
})
