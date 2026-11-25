/**
 * Design standard step 1 (TRAK-768): the brand colour is now near-black and means "the main action" or "selected".
 * Marks that mean done or good use the success green, and the pitch its own green, so they don't turn black.
 * Each entry: a file, and text that picks out the line.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const lineOf = (file: string, marker: string) => {
  const lines = readFileSync(join(SRC, file), 'utf8').split('\n').filter(line => line.includes(marker))
  expect([file, marker, lines.length]).toEqual([file, marker, 1])
  return lines[0]
}

const DONE_MARKS: [file: string, marker: string][] = [
  ['components/coach/squad/formations/FormationBoard.tsx', 'data-mark="done"'],
  ['components/coach/games/Pitch.tsx', '<Check size={10} strokeWidth={3} /></span>'],
  ['components/player/FamilyMatch.tsx', "review.didJob === 'yes' &&"],
  ['components/coach/FixtureImport.tsx', "coachSchedule:fxAdded"],
  ['pages/DevSetupPage.tsx', 'All done!'],
]

describe('done marks stay green, the pitch has its own green', () => {
  it.each(DONE_MARKS)('%s (%s) uses the success colour', (file, marker) => {
    const line = lineOf(file, marker)
    expect(line).toMatch(/(bg|text)-success/)
    expect(line).not.toMatch(/(bg|text)-brand/)
  })

  it("Training's confirmations tick in green", () => {
    const source = readFileSync(join(SRC, 'pages/coach/training/CoachTraining.tsx'), 'utf8')
    const ticks = source.match(/<Check aria-hidden size=\{18\} className="[^"]*"/g) ?? []
    expect(ticks).toEqual(['<Check aria-hidden size={18} className="text-success"', '<Check aria-hidden size={18} className="text-success"'])
  })

  it('the pitch is drawn in the pitch green', () => {
    const board = readFileSync(join(SRC, 'components/coach/squad/formations/FormationBoard.tsx'), 'utf8')
    expect(lineOf('components/coach/squad/formations/FormationBoard.tsx', 'viewBox="0 0 100 125"')).toContain('text-pitch')
    expect(lineOf('components/coach/squad/formations/FormationBoard.tsx', 'aspect-[4/5]')).toContain('bg-pitch/5')
    expect(board).not.toMatch(/bg-brand\/5/)
  })
})

describe('the palette change leaves nothing unreadable or lost (whole-branch review)', () => {
  it('the season objectives donut is in shades of green (TRAK-551)', () => {
    const line = lineOf('components/coach/home/SeasonPlanCard.tsx', 'const OBJECTIVE_GREENS')
    expect(line).toContain('--t-success')
    expect(line).not.toContain('--t-brand')
  })

  it("the club's copied tick is green", () => {
    expect(lineOf('pages/club/ClubProfile.tsx', '<Check size={18} style=')).toContain('--t-success')
  })

  // Near-black against the grey sentence around it is 2.4:1, under the 3:1 a link needs to stand out without an underline.
  it.each([
    ['pages/parent/ParentAssessment.tsx', 'void progress.refetch() }} className='],
    ['pages/parent/ParentAssessment.tsx', 'void query.refetch() }} className='],
    ['pages/player/PlayerFeedback.tsx', 'type="button" onClick={() => void progress.refetch()} className='],
    ['pages/player/PlayerFeedback.tsx', 'onClick={onRetry} className='],
    ['pages/Settings.tsx', 'setLoadAttempt(value => value + 1)} className='],
  ])('%s: the Try again link inside a sentence is underlined', (file, marker) => {
    expect(lineOf(file, marker)).toMatch(/\bunderline\b/)
  })

  it("Notes' soft panel still shows on a white card", () => {
    const line = lineOf('components/coach/training/NotesForm.tsx', 'grid gap-3 rounded-xl')
    expect(line).toContain('bg-raised')
    expect(line).not.toContain('bg-ground')
  })

  it("Arc's info alert icon is the info blue, as its badge is", () => {
    const css = readFileSync(join(SRC, 'components/arc/alert/alert.module.css'), 'utf8')
    expect(css).toContain('.info .icon { color: var(--info); }')
  })
})
