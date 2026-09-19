import { AGE_GROUPS } from '@/lib/constants'

// F-6. Onboarding collected a date of birth and an age group as independent
// fields and accepted any combination. The reported case was harmless — someone
// born in 2000 choosing U19+ — but the same absence of a check lets a child
// born in 2010 choose U19+, and that is the direction that matters:
// squad_player_consent_required() follows date_of_birth, so an age band
// contradicting it is a signal nobody is reading.
//
// The rule is not "the band must equal the age". Playing UP an age group is
// normal and legitimate in youth football, so a 12-year-old in U15 is fine.
// Playing DOWN is the one that should never happen, so the rule is eligibility:
// for "U15" the player must be under 15. U19+ is the open top band.
//
// LIMITATION, stated rather than papered over: real competitions set age groups
// from a season cut-off date, not from the player's birthday. We have no season
// configured anywhere in this product, and inventing a cut-off would be worse
// than using current age, so this uses current age and is deliberately
// permissive at the boundary. If a season is ever configured, this is the one
// place to change.

/**
 * Whole years old on `on` (default today). Returns null for an unparseable date.
 *
 * A date of birth is a calendar date, not an instant, so it is compared as one.
 * The previous implementation in consent.ts did `new Date('2011-09-20')` — UTC
 * midnight — and then read it back with LOCAL getters, so the answer depended on
 * the viewer's timezone and the time of day. In America/New_York a child whose
 * fifteenth birthday was tomorrow read as fifteen, and needsParentalConsent()
 * returned false. The database gate is correct (Postgres age() on a date), so
 * nothing unconsented was ever written — instead the child was never asked for a
 * guardian's email, signed up, and then had every assessment refused by RLS with
 * no way to resolve it from the UI.
 */
export function ageInYears(dateOfBirth: string | Date, on: Date = new Date()): number | null {
  if (dateOfBirth instanceof Date) {
    if (Number.isNaN(dateOfBirth.getTime())) return null
    dateOfBirth = `${dateOfBirth.getUTCFullYear()}-`
      + `${String(dateOfBirth.getUTCMonth() + 1).padStart(2, '0')}-`
      + `${String(dateOfBirth.getUTCDate()).padStart(2, '0')}`
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth?.trim() ?? '')
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // Round-trip through UTC so a local timezone cannot shift the calendar day.
  const born = new Date(Date.UTC(y, mo - 1, d))
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== mo - 1 || born.getUTCDate() !== d) {
    return null   // 31 February and friends
  }
  // UTC, deliberately, because the authority is the database: player_age_years()
  // uses Postgres age(current_date, ...) and current_date is the server's date.
  // consent.ts exists so the UI can ask the same question the server will, so
  // using the viewer's LOCAL date here would disagree with it for up to a day
  // at the boundary — the same defect this replaced, pointing the other way.
  const today = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()))
  if (born > today) return null
  let age = today.getUTCFullYear() - y
  const hadBirthday =
    today.getUTCMonth() > born.getUTCMonth() ||
    (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() >= born.getUTCDate())
  if (!hadBirthday) age -= 1
  return age
}

/** The ceiling in "U15" → 15. Null for the open band or anything unrecognised. */
export function ageGroupCeiling(ageGroup: string): number | null {
  const m = /^U(\d{1,2})$/.exec(ageGroup?.trim() ?? '')
  return m ? Number(m[1]) : null
}

/**
 * Is this player eligible for this age group?
 * Playing up is allowed; playing down is not. Unknown or incomplete input is
 * permitted, because this guards a mismatch and must not block a signup it
 * cannot actually evaluate.
 */
export function ageGroupMatches(dateOfBirth: string | Date, ageGroup: string, on: Date = new Date()): boolean {
  const ceiling = ageGroupCeiling(ageGroup)
  if (ceiling === null) return true          // U19+ or unrecognised: open band
  const age = ageInYears(dateOfBirth, on)
  if (age === null) return true              // no usable date: not this check's job
  return age < ceiling
}

/** The youngest band this player is eligible for, for the error message. */
export function lowestEligibleAgeGroup(dateOfBirth: string | Date, on: Date = new Date()): string | null {
  const age = ageInYears(dateOfBirth, on)
  if (age === null) return null
  return AGE_GROUPS.find(g => {
    const ceiling = ageGroupCeiling(g)
    return ceiling === null || age < ceiling
  }) ?? null
}
