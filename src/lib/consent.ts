/**
 * Parental consent for players below the digital-consent age.
 *
 * Greek digital-consent age is 15. Below it a holder of parental
 * responsibility must authorise, and we must be able to show what they
 * agreed to and when. The database is the authority — `consent_threshold_age()`
 * and `player_consent_required()` enforce it. These values exist so the UI can
 * ask the same question before a round trip, and must be kept in step with
 * `20260912000001_parental_consent.sql`.
 */

/** Mirrors `public.consent_threshold_age()`. Change both together. */
export const CONSENT_THRESHOLD_AGE = 15

/**
 * Bump whenever the wording below changes. Stored on every consent record so
 * a past consent can be reconstructed against the text actually shown.
 */
export const CONSENT_NOTICE_VERSION = '2026-09-12.1'

/** Whole years, the way an age threshold is read in law. */
export const ageFromDateOfBirth = (dob: string | Date): number | null => {
  const birth = dob instanceof Date ? dob : new Date(dob)
  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDelta = today.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export const needsParentalConsent = (dob: string | Date): boolean => {
  const age = ageFromDateOfBirth(dob)
  return age !== null && age < CONSENT_THRESHOLD_AGE
}

/**
 * Separate choices, never one bundled yes. The first is the reason the app
 * exists and is presented as required — if a parent declines it there is
 * nothing to use, so the honest answer is not to create the account. The rest
 * are genuinely optional and default to off, per the Children's Code standard
 * that new features start at high privacy.
 */
export type ConsentPurposeKey = 'coaching_records' | 'recognition' | 'parent_visibility'

export const CONSENT_PURPOSES: {
  key: ConsentPurposeKey
  label: string
  detail: string
  required: boolean
}[] = [
  {
    key: 'coaching_records',
    label: "Their coach can record assessments and matches",
    detail:
      "Six skill ratings after a session, the matches they play, and a written note from the coach. This is what the app is for.",
    required: true,
  },
  {
    key: 'recognition',
    label: 'Their coach can give them recognition awards',
    detail: 'Things like player of the week, visible to you and to them.',
    required: false,
  },
  {
    key: 'parent_visibility',
    label: 'I can see their progress',
    detail:
      "Their season band, match history and coach assessments. The coach's private notes are never shared with anyone.",
    required: false,
  },
]

/**
 * The exact wording shown to the parent, stored verbatim on the record. Kept
 * here rather than inline in the component so the string that is displayed and
 * the string that is saved cannot drift apart.
 */
export const CONSENT_STATEMENT =
  'I confirm I hold parental responsibility for this child and I authorise the processing I have selected above. ' +
  'I understand I can withdraw at any time from my profile, and that withdrawing stops future processing.'
