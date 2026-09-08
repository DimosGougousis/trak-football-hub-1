/**
 * Maps the 6 coach assessment dimensions (0..10) into the 5 player Card stats (0..10).
 *
 * Coach evaluates real, observable inputs. The Card derives from them so the
 * coach UX is grounded while the player UX is simple & gamified.
 *
 * These values are written straight into `coach_assessments`, whose card-stat
 * columns are INTEGER. Rounding to one decimal produced values like 6.5 and
 * Postgres rejected the whole insert with `invalid input syntax for type
 * integer`, so an assessment failed whenever a derived average landed on a
 * half — around three times in four. Whole numbers only.
 */
export interface CoachInputs {
  workRate: number
  tactical: number
  attitude: number
  technical: number
  physical: number
  coachability: number
}

export interface CardStats {
  consistency: number
  impact: number
  workrate: number
  technique: number
  spirit: number
}

/** Whole number, clamped to the 0..10 the columns and the Card both expect. */
const stat = (n: number) => Math.min(10, Math.max(0, Math.round(n)))

export function deriveCardStats(c: CoachInputs): CardStats {
  return {
    consistency: stat(c.attitude),
    impact:      stat(c.technical),
    workrate:    stat(c.workRate),
    technique:   stat((c.technical + c.tactical) / 2),
    spirit:      stat((c.attitude + c.coachability) / 2),
  }
}
