import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeMatchScore } from '@/lib/rating-engine'
import type { MatchInput } from '@/lib/types'

/**
 * K4: a coach logging a match must not invent the player's account of it.
 *
 * CoachAddSession sent p_self_rating: 'Average' and p_body_condition: 'Average'
 * on every match a coach logged. Those are the player's OWN report — how they
 * felt, how they rated their performance — and nobody asked the child. The
 * record said they answered.
 *
 * Both columns are nullable, so the invention bought nothing at all.
 */

const ROUTED_FLOW = join(process.cwd(), 'src', 'pages', 'coach', 'CoachAddSession.tsx')

/** Source with comments stripped: a comment explaining a removal must not re-trigger the check. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function baseInput(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    position: 'mid',
    competition: 'league',
    venue: 'home',
    opponent: 'Al Wasl',
    score_us: 2,
    score_them: 1,
    minutes_played: 90,
    card: 'none',
    body_condition: 'average' as MatchInput['body_condition'],
    self_rating: 'average' as MatchInput['self_rating'],
    position_inputs: {},
    is_friendly: false,
    ...overrides,
  }
}

describe('K4: the coach flow does not fabricate the player\'s own report', () => {
  it('does not send a self-rating or body condition to the match RPC', () => {
    const src = code(ROUTED_FLOW)
    const rpcCall = src.slice(src.indexOf('log_match_for_player'))

    for (const field of ['p_self_rating', 'p_body_condition']) {
      const m = new RegExp(`${field}:\\s*([^,\\n]+)`).exec(rpcCall)
      expect(m, `${field} is no longer passed to log_match_for_player at all`).toBeTruthy()
      // `null`, optionally followed by a cast — the generated types declare the
      // parameter as `string` because a Postgres parameter carries no
      // nullability, so a narrow cast is expected here.
      expect(
        /^null\b/.test(m![1].trim()),
        `${field} is set to "${m![1].trim()}" in a coach-driven flow. That column is the ` +
          `player's own account of the match and the child was never asked, so the stored record ` +
          `would claim they answered. The column is nullable — pass null.`,
      ).toBe(true)
    }
  })
})

describe('removing them changes no rating, which is why it is safe', () => {
  // The claim the fix rests on. If someone later adds an 'average' branch to
  // either ladder, these two stop being neutral and every coach-logged match
  // silently shifts. That is the regression this guards.
  it("self_rating 'average' scores identically to no self-rating", () => {
    const withAverage = computeMatchScore(baseInput())
    const withNothing = computeMatchScore(baseInput({ self_rating: undefined as unknown as MatchInput['self_rating'] }))
    expect(withNothing).toBe(withAverage)
  })

  it("body_condition 'good' and 'average' score identically to none", () => {
    const none = computeMatchScore(
      baseInput({ body_condition: undefined as unknown as MatchInput['body_condition'] }),
    )
    // 'good' is what the code used to send — note it is not even in the
    // engine's vocabulary, which is fresh / tired / knock.
    expect(computeMatchScore(baseInput({ body_condition: 'good' as MatchInput['body_condition'] }))).toBe(none)
    expect(computeMatchScore(baseInput())).toBe(none)
  })

  it('the values that DO move a score still move it, so the test is not vacuous', () => {
    const neutral = computeMatchScore(baseInput())
    expect(computeMatchScore(baseInput({ self_rating: 'excellent' as MatchInput['self_rating'] })))
      .toBeGreaterThan(neutral)
    expect(computeMatchScore(baseInput({ self_rating: 'poor' as MatchInput['self_rating'] })))
      .toBeLessThan(neutral)
    expect(computeMatchScore(baseInput({ body_condition: 'knock' as MatchInput['body_condition'] })))
      .toBeLessThan(neutral)
  })
})
