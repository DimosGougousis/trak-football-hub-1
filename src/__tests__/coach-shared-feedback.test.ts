import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * K9's product half: the coach can write feedback for the child and publish it
 * deliberately.
 *
 * Without this, K9 is a net removal — the four children who can currently read
 * a coach note read nothing, and no coach can give them anything, because the
 * table has no writer. The pilot's fourth pillar is "the loop must close:
 * coach assesses -> athlete sees", so shipping the privacy fix alone breaks the
 * thing we demo.
 *
 * "No auto-copy" is a schema property in the migration. These assert it is also
 * a UI property, which is where it would actually be violated: one careless
 * `setShared(note)` and every private note becomes publishable in one tap.
 */

const PAGE = join(process.cwd(), 'src', 'pages', 'coach', 'CoachAssessPage.tsx')

/** Source with comments stripped — prose must not satisfy or trip these. */
function code(): string {
  return readFileSync(PAGE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('K9 UI: the coach writes shared feedback separately', () => {
  it('writes it to coach_shared_feedback, not to the notes table', () => {
    const src = code()
    expect(src.includes('coach_shared_feedback'), 'the page never writes shared feedback').toBe(true)
  })

  it('never copies the private note into the shared box', () => {
    const src = code()
    // The violation to catch: seeding the shared field from `note`, in either
    // direction. Auto-copy is what Imad's decision ruled out, and the schema
    // cannot prevent it — only the UI can.
    expect(
      /setShared\s*\(\s*note\b/.test(src),
      'the page seeds shared feedback from the private note. That is the auto-copy Imad ruled ' +
        'out: the coach wrote those words for themselves, and one tap would publish them to the child.',
    ).toBe(false)
    expect(
      /setNote\s*\(\s*shared\b/.test(src),
      'the page seeds the private note from the shared text, which conflates the two records.',
    ).toBe(false)
  })

  it('publishes only when the coach asked and there is something to publish', () => {
    const src = code()
    // Anchor on the write, not the first mention — the read above it carries a
    // `published_at: string | null` type annotation that matches just as well.
    const upsertAt = src.indexOf('.upsert(', src.indexOf("coach_shared_feedback' as any"))
    expect(upsertAt, 'the page never upserts shared feedback').toBeGreaterThan(-1)
    const upsert = src.slice(upsertAt)
    const m = /published_at:\s*([^,\n]+)/.exec(upsert)
    expect(m, 'the upsert does not set published_at at all').toBeTruthy()
    const expr = m![1]
    expect(
      expr.includes('sharedPublished'),
      `published_at is set to "${expr}" without consulting the publish control, so saving an ` +
        `assessment would publish a draft the coach had not released.`,
    ).toBe(true)
    expect(
      /:\s*null/.test(expr),
      'published_at has no null branch, so feedback can never be retracted once published.',
    ).toBe(true)
  })

  it('reads back what the child can already see', () => {
    const src = code()
    expect(
      /\.from\('coach_shared_feedback'[\s\S]{0,120}\.select\(/.test(src),
      'the page never loads existing shared feedback, so a coach editing an assessment sees a ' +
        'blank box and cannot correct text the child is currently reading.',
    ).toBe(true)
  })

  it('no longer tells the coach their private note reaches the player', () => {
    // The label said "AI will expand these into personalised feedback for the
    // player". K9 makes that false — player-feedback runs as the player and can
    // no longer read the note. A label promising a coach their words reach the
    // child, when they do not, is worse than no label.
    const src = readFileSync(PAGE, 'utf8')
    expect(
      /AI will expand these into personalised feedback for the player/.test(src),
      'the improvement-areas label still claims the private note becomes player feedback. Under ' +
        'K9 the player cannot read it.',
    ).toBe(false)
  })
})
