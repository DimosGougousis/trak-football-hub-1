import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateSquadAnalytics } from '../squad-analytics'

function makeAssessment(
  id: string,
  squadPlayerId: string,
  coachRating: number,
  createdAt: string,
) {
  return { id, squad_player_id: squadPlayerId, coach_rating: coachRating, created_at: createdAt }
}

function makePlayer(id: string, name: string) {
  return { id, player_name: name }
}

describe('calculateSquadAnalytics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns zeroes for empty inputs', () => {
    const result = calculateSquadAnalytics([], [])
    expect(result.totalPlayers).toBe(0)
    expect(result.totalAssessments).toBe(0)
    expect(result.avgRating).toBe(0)
    expect(result.mostImproved).toBeNull()
    expect(result.needsAttention).toEqual([])
  })

  it('computes correct totals and average', () => {
    const players = [makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')]
    const assessments = [
      makeAssessment('a1', 'p1', 8.0, '2026-04-10T10:00:00Z'),
      makeAssessment('a2', 'p1', 6.0, '2026-04-11T10:00:00Z'),
      makeAssessment('a3', 'p2', 7.0, '2026-04-10T10:00:00Z'),
    ]
    const result = calculateSquadAnalytics(players, assessments)
    expect(result.totalPlayers).toBe(2)
    expect(result.totalAssessments).toBe(3)
    expect(result.avgRating).toBe(7)
  })

  it('computes band distribution correctly', () => {
    const players = [makePlayer('p1', 'Alice')]
    const assessments = [
      makeAssessment('a1', 'p1', 9.5, '2026-04-10T10:00:00Z'), // exceptional
      makeAssessment('a2', 'p1', 8.5, '2026-04-11T10:00:00Z'), // standout
      makeAssessment('a3', 'p1', 7.5, '2026-04-12T10:00:00Z'), // good
    ]
    const result = calculateSquadAnalytics(players, assessments)
    expect(result.bandDistribution['exceptional']).toBe(1)
    expect(result.bandDistribution['standout']).toBe(1)
    expect(result.bandDistribution['good']).toBe(1)
    expect(result.bandDistribution['steady']).toBe(0)
  })

  it('identifies most improved player', () => {
    const players = [makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')]
    // Alice: first half avg 5.0, second half avg 8.0 => improvement 3.0
    const assessments = [
      makeAssessment('a1', 'p1', 5.0, '2026-04-01T10:00:00Z'),
      makeAssessment('a2', 'p1', 5.0, '2026-04-02T10:00:00Z'),
      makeAssessment('a3', 'p1', 8.0, '2026-04-10T10:00:00Z'),
      makeAssessment('a4', 'p1', 8.0, '2026-04-11T10:00:00Z'),
      // Bob: first half avg 7.0, second half avg 7.5 => improvement 0.5
      makeAssessment('a5', 'p2', 7.0, '2026-04-01T10:00:00Z'),
      makeAssessment('a6', 'p2', 7.5, '2026-04-11T10:00:00Z'),
    ]
    const result = calculateSquadAnalytics(players, assessments)
    expect(result.mostImproved).not.toBeNull()
    expect(result.mostImproved!.name).toBe('Alice')
    expect(result.mostImproved!.improvement).toBe(3)
  })

  it('returns null for mostImproved when no player has improvement', () => {
    const players = [makePlayer('p1', 'Alice')]
    // All same rating => improvement = 0, not > 0
    const assessments = [
      makeAssessment('a1', 'p1', 7.0, '2026-04-01T10:00:00Z'),
      makeAssessment('a2', 'p1', 7.0, '2026-04-11T10:00:00Z'),
    ]
    const result = calculateSquadAnalytics(players, assessments)
    expect(result.mostImproved).toBeNull()
  })

  it('flags players with no assessments', () => {
    const players = [makePlayer('p1', 'Alice')]
    const result = calculateSquadAnalytics(players, [])
    expect(result.needsAttention).toHaveLength(1)
    expect(result.needsAttention[0].reason).toBe('No assessments recorded')
  })

  it('flags players with no assessment in 14+ days', () => {
    const players = [makePlayer('p1', 'Alice')]
    const assessments = [
      makeAssessment('a1', 'p1', 7.0, '2026-03-20T10:00:00Z'), // 23 days ago
    ]
    const result = calculateSquadAnalytics(players, assessments)
    expect(result.needsAttention).toHaveLength(1)
    expect(result.needsAttention[0].reason).toBe('No assessment in 14+ days')
  })

  it('flags players with declining trend (6+ assessments)', () => {
    const players = [makePlayer('p1', 'Alice')]
    const assessments = [
      // Previous 3: avg 8.0
      makeAssessment('a1', 'p1', 8.0, '2026-04-01T10:00:00Z'),
      makeAssessment('a2', 'p1', 8.0, '2026-04-02T10:00:00Z'),
      makeAssessment('a3', 'p1', 8.0, '2026-04-03T10:00:00Z'),
      // Last 3: avg 5.0
      makeAssessment('a4', 'p1', 5.0, '2026-04-10T10:00:00Z'),
      makeAssessment('a5', 'p1', 5.0, '2026-04-11T10:00:00Z'),
      makeAssessment('a6', 'p1', 5.0, '2026-04-12T10:00:00Z'),
    ]
    const result = calculateSquadAnalytics(players, assessments)
    expect(result.needsAttention.some(n => n.reason === 'Declining trend')).toBe(true)
  })

  it('does not flag declining trend with fewer than 6 assessments', () => {
    const players = [makePlayer('p1', 'Alice')]
    const assessments = [
      makeAssessment('a1', 'p1', 9.0, '2026-04-10T10:00:00Z'),
      makeAssessment('a2', 'p1', 5.0, '2026-04-11T10:00:00Z'),
      makeAssessment('a3', 'p1', 5.0, '2026-04-12T10:00:00Z'),
    ]
    const result = calculateSquadAnalytics(players, assessments)
    expect(result.needsAttention.some(n => n.reason === 'Declining trend')).toBe(false)
  })

  it('does not double-flag a player for both stale and declining', () => {
    const players = [makePlayer('p1', 'Alice')]
    const assessments = [
      makeAssessment('a1', 'p1', 8.0, '2026-03-01T10:00:00Z'),
      makeAssessment('a2', 'p1', 8.0, '2026-03-02T10:00:00Z'),
      makeAssessment('a3', 'p1', 8.0, '2026-03-03T10:00:00Z'),
      makeAssessment('a4', 'p1', 5.0, '2026-03-10T10:00:00Z'),
      makeAssessment('a5', 'p1', 5.0, '2026-03-11T10:00:00Z'),
      makeAssessment('a6', 'p1', 5.0, '2026-03-12T10:00:00Z'),
    ]
    const result = calculateSquadAnalytics(players, assessments)
    // Should have stale flag (last assessment > 14 days ago)
    // But declining trend should not double-add
    const playerFlags = result.needsAttention.filter(n => n.playerId === 'p1')
    expect(playerFlags).toHaveLength(1)
    expect(playerFlags[0].reason).toBe('No assessment in 14+ days')
  })
})
