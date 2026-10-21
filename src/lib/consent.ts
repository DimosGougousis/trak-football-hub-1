/**
 * UI helpers for the existing parental-consent implementation.
 *
 * The database is the authority — `consent_threshold_age()` and
 * `player_consent_required()` decide. This constant lets the UI ask the same
 * question without a round trip; `consent-threshold-agreement.test.ts` fails
 * if it drifts from the last migration that defines the function.
 */

/** Mirrors `public.consent_threshold_age()` (20260921120000). Change both together. */
export const CONSENT_THRESHOLD_AGE = 18

/**
 * Bump whenever the wording below changes. Stored on every consent record so
 * a past consent can be reconstructed against the text actually shown.
 */
export const CONSENT_NOTICE_VERSION = '2026-10-19.1'

/**
 * TRAK-177: a 15–17 player's own consent, where the academy's consent age is
 * 15 (Greece). Provisional wording from the Greek legal pack, until a Greek
 * lawyer signs off. Bump the version whenever the text changes. TRAK-135
 * (Kostas's wording, Imad agreed 21 Oct): the guardian's events line from
 * TRAK-166, in the player's own words, since they get event emails too.
 */
export const OWN_CONSENT_NOTICE_VERSION = '2026-10-21.1-own'
export const OWN_CONSENT_TEXT =
  'I understand how Trak works and agree that my academy may keep my coaching records in Trak: ' +
  'my coach\'s ratings and assessments, my sessions and matches, and messages my coach publishes for me. ' +
  'I can change my mind and withdraw at any time in Settings. If I do not agree, I still get the same coaching. ' +
  "Events: my training and match schedule is shown in the app and, if I choose, in my phone's calendar through a private link. Trak emails me when an event is added, changed or cancelled, and again two days before it. I can turn the reminder off in Settings."

/** Whole years from a valid YYYY-MM-DD, using the database's UTC calendar day. */
export const ageFromDateOfBirth = (dob: string): number | null => {
  if (dob.length !== 10) return null
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!parts) return null

  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return null

  // Validate calendar components directly: Date parsing normalizes Feb 31.
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day > daysInMonth[month - 1]) return null

  const today = new Date()
  const monthDelta = today.getUTCMonth() + 1 - month
  let age = today.getUTCFullYear() - year
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < day)) age--
  return age < 0 ? null : age
}

export const needsParentalConsent = (dob: string): boolean => {
  const age = ageFromDateOfBirth(dob)
  return age !== null && age < CONSENT_THRESHOLD_AGE
}

/**
 * Separate choices, never one bundled yes. The first is the reason the app
 * exists and is presented as required — if a parent declines it there is
 * nothing to use, so the honest answer is not to create the account. The rest
 * are genuinely optional and default to off, per the Children's Code standard
 * that new features start at high privacy. Offer only choices the backend
 * enforces: "I can see their progress" was optional here but never controlled
 * what parents read, so parent viewing now sits in the required purpose, as
 * MVP J2 says (TRAK-145, 9 Oct 2026).
 */
export type ConsentPurposeKey = 'coaching_records' | 'recognition'

export const CONSENT_PURPOSES: {
  key: ConsentPurposeKey
  label: string
  /** {child} is the child's first name. */
  detail: string
  required: boolean
}[] = [
  // TRAK-182 (Imad's wording, 15 Oct): the consent bar's Details panel.
  {
    key: 'coaching_records',
    label: 'Coaching records',
    detail: 'Their coach records their progress, logs their matches and can write feedback. You see their bands and history. Their coach can also keep private notes, which are never shared.',
    required: true,
  },
  {
    key: 'recognition',
    label: 'Recognition awards',
    detail: 'Things like player of the week, seen by you and {child}.',
    required: false,
  },
]

/**
 * The exact wording shown to the parent beside Approve, stored verbatim on the
 * record with the child's first name filled in. Kept here rather than inline
 * in the component so the string that is displayed and the string that is
 * saved cannot drift apart. TRAK-182 (Imad, 15 Oct): approving is the
 * confirmation; there is no separate tick box. The server keeps this sentence
 * as the record (it only checks it is not empty), so it says "agree" (Kostas,
 * #314; Imad, 15 Oct).
 */
export const CONSENT_STATEMENT_TEMPLATE =
  "By approving, you confirm you're {child}'s parent or legal guardian and agree to the choices above. " +
  'You can withdraw any time in settings, which stops new records. ' +
  "Events: your child's training and match schedule is shown in the app and, if you choose, in your phone's calendar through a private link. We email you, and your child, when an event is added, changed or cancelled, and again two days before it. You can turn the reminder off in Settings."

export const withChild = (text: string, firstName: string) => text.split('{child}').join(firstName)
export const consentStatement = (firstName: string) => withChild(CONSENT_STATEMENT_TEMPLATE, firstName)
