import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BANDS } from '@/lib/types'

/**
 * Findings from Kostas's manual test of the player surface, 18 September 2026.
 * Full triage: docs/reviews/player-surface-findings-2026-09-18.md
 *
 * ── What these are, and what they are not
 *
 * These are TRIPWIRES READ FROM SOURCE, not executed user journeys. Imad's
 * criticism of my K8 tests was exactly that a source-string check does not
 * execute the path, and he was right. The player surface belongs to Tarek and
 * this was written while he was offline, so nothing here edits his files —
 * which also means nothing here can execute his components without first
 * building the fixtures that would amount to rewriting them.
 *
 * So each assertion names a specific defective construct and fails while it is
 * present. That is weaker than a journey and it is stated rather than implied.
 *
 * ── Why they are gated
 *
 * They FAIL on purpose. `npm test` and CI must stay green, because a
 * permanently red main teaches people to ignore the colour — Tarek's rule from
 * the consent suite, and the reason his own failing assertions sit behind
 * `--consent-review` rather than in `--all`.
 *
 *     npm run test:findings
 *
 * Each one turns green when its finding is fixed, and not before.
 */

const ENABLED = process.env.TRAK_FINDINGS === '1'
const src = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8')

/** Strip comments, so a finding described in prose is not mistaken for code. */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe.skipIf(!ENABLED)('player surface findings (expected to fail until fixed)', () => {
  // ── F-1 ────────────────────────────────────────────────────────────────
  //
  // "Latest coach assessments on home page shows all ratings on 'mixed' with
  //  orange colours whereas on profile page under performance trend the
  //  colours are blue and show 'steady'."
  //
  // PlayerProfilePage carries its own band ladder. A score of 5 is Mixed
  // (orange) canonically and Steady (blue) there, which is the contradiction
  // as reported. This compares the numbers rather than asserting the absence
  // of a string, so it fails on the divergence itself.
  it('F-1: the profile page does not define its own band thresholds', () => {
    const text = code(src('pages', 'player', 'PlayerProfilePage.tsx'))

    // Every `score >= N` in a band ladder, in source order.
    const thresholds = [...text.matchAll(/score\s*>=\s*(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]))

    // BANDS' own cut points, highest first, excluding the 0 floor.
    const canonical = BANDS.map(b => b.minScore).filter(n => n > 0).sort((a, b) => b - a)

    expect(
      thresholds,
      'PlayerProfilePage defines a local score->band ladder. It disagrees with ' +
        'scoreToBand(): a 5 is "Mixed" (orange) canonically and "Steady" (blue) here, ' +
        'and the local copy has no Exceptional and no Difficult at all. CLAUDE.md: ' +
        'colours and bands come from BANDS, never a second copy.',
    ).toEqual(thresholds.length === 0 ? [] : canonical)
  })

  it('F-1: the profile page renders no hardcoded band colours', () => {
    const text = code(src('pages', 'player', 'PlayerProfilePage.tsx'))
    const bandColours = BANDS.map(b => b.color).filter(c => c.startsWith('#'))
    const found = bandColours.filter(c => text.includes(c))
    expect(
      found,
      `PlayerProfilePage hardcodes band colours ${found.join(', ')} rather than reading ` +
        `them from BANDS, so a change to the palette updates one screen and not the other.`,
    ).toEqual([])
  })

  // ── F-2 ────────────────────────────────────────────────────────────────
  //
  // "Name updates after refreshing the page."
  //
  // saveName() writes profiles.full_name and toasts "Name updated" without
  // calling refreshProfile(), so AuthContext keeps the old name and every
  // screen reading profile.full_name shows it until a reload. The same file's
  // avatar handler does call refreshProfile, so the pattern was available.
  it('F-2: saving a name refreshes the profile in context', () => {
    const text = code(src('pages', 'Settings.tsx'))
    const start = text.indexOf("update({ full_name")
    expect(start, 'the name-save path moved').toBeGreaterThan(-1)
    // From the write to the end of its handler.
    const handler = text.slice(start, start + 600)
    expect(
      /refreshProfile\s*\(/.test(handler),
      'Settings saves the name and reports success without refreshing the profile in ' +
        'AuthContext, so every screen keeps showing the old name until a page reload.',
    ).toBe(true)
  })

  it('F-2: the name write is verified rather than assumed', () => {
    const text = code(src('pages', 'Settings.tsx'))
    const start = text.indexOf("update({ full_name")
    const handler = text.slice(start, start + 600)
    expect(
      /\.select\(/.test(handler),
      'The name update has no read-back, so a zero-row update — an absent profile row or ' +
        'an RLS denial — returns no error and is reported as "Name updated". Twenty-second ' +
        'instance of absence-of-error treated as success.',
    ).toBe(true)
  })

  // ── F-4 ────────────────────────────────────────────────────────────────
  //
  // "I tried sharing evolution card on messages and it showed a text with
  //  everything in writing."
  //
  // PlayerPassport captures an image and shares `files`. PlayerEvolutionCard
  // shares `{ title, text }` with no files key, so the OS share sheet has only
  // a string to hand to Messages.
  it('F-4: the Evolution Card shares an image, not a string', () => {
    const text = code(src('pages', 'player', 'PlayerEvolutionCard.tsx'))
    const shareAt = text.indexOf('navigator.share')
    expect(shareAt, 'the Evolution Card share path moved').toBeGreaterThan(-1)
    const call = text.slice(shareAt, shareAt + 300)
    expect(
      /files\s*:/.test(call),
      'PlayerEvolutionCard calls navigator.share without a `files` key, so the card is ' +
        'shared as plain text. PlayerPassport already does this correctly — html2canvas, ' +
        'canvas.toBlob, then share({ files: [file] }).',
    ).toBe(true)
  })

  // ── F-5 ────────────────────────────────────────────────────────────────
  //
  // "I created a new player account using an email that I had already used…
  //  it sent an email to the parent that was linked to the old account."
  //
  // Supabase returns the EXISTING user for a duplicate-email signup, so
  // auth.uid() is the old account for everything downstream. Two independent
  // consequences, and the second is the serious one.
  //
  // No fix is asserted here, because the right behaviour is a product decision
  // with a real tradeoff — telling the user an account exists gives up
  // email-enumeration protection for a product whose users are minors. These
  // assertions pin the two mechanisms so that whichever way it is decided,
  // the decision has to touch them.
  it('F-5: a second signup cannot rename an existing profile', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260611000001_signup_provisioning_rpc.sql'),
      'utf8',
    )
    const conflictAt = sql.indexOf('ON CONFLICT (user_id) DO UPDATE')
    expect(conflictAt, 'the profile upsert moved').toBeGreaterThan(-1)
    const clause = sql.slice(conflictAt, conflictAt + 300)
    expect(
      /full_name\s*=\s*EXCLUDED\.full_name\s*,/.test(clause),
      'provision_my_profile overwrites full_name unconditionally on conflict. Because a ' +
        'duplicate-email signup authenticates as the EXISTING user, the second signup ' +
        "renames the first account's profile.",
    ).toBe(false)
  })

  it('F-5: a parent invite is only sent to an address this signup supplied', () => {
    const handler = readFileSync(
      join(process.cwd(), 'supabase', 'functions', 'send-parent-invite', 'handler.ts'),
      'utf8',
    )
    expect(
      /supplied_by_this_signup|invite_requested_at|p_parent_email/.test(handler),
      'send-parent-invite selects invites by player_user_id === caller.id and mails ' +
        "invite.parent_email. On a duplicate-email signup the caller IS the old account, so " +
        "it mails the FIRST child's guardian about a signup they have nothing to do with. " +
        'Nothing ties the invite it sends to the address the current signup actually gave.',
    ).toBe(true)
  })

  // ── F-6 ────────────────────────────────────────────────────────────────
  //
  // "I was able to sign up as a player born in 2000 playing for the team U19+."
  //
  // Stated precisely: that specific pairing may well be correct, since U19+
  // plausibly means 19-and-over. The defect is that NO pairing is checked, so
  // a child born in 2010 selecting U19+ passes identically — and that is the
  // direction that matters, because squad_player_consent_required() follows
  // date_of_birth and an age band contradicting it is a signal nobody reads.
  it('F-6: the age group is checked against the date of birth', () => {
    const text = code(src('pages', 'OnboardingPage.tsx'))
    const hasDob = text.includes('date_of_birth') || text.includes('dateOfBirth')
    expect(hasDob, 'onboarding no longer collects a date of birth').toBe(true)
    expect(
      /ageGroupFor|deriveAgeGroup|ageGroupMatches|validateAgeGroup/.test(text),
      'OnboardingPage collects date_of_birth and age_group as independent fields with no ' +
        'cross-check, so any combination is accepted in either direction.',
    ).toBe(true)
  })
})
