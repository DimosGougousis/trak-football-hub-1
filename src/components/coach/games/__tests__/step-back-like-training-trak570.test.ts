/**
 * TRAK-570 (Tarek, phone review, 23 Nov): a match's game plan and evaluation steps have the same Back button as a
 * training's plan session: Arc's Button, variant "secondary" (outlined), not "ghost".
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')
/** The variant of every Button (one per line) whose label is the shared "Back". */
const backVariants = (file: string) => source(file).split('\n')
  .filter(line => line.includes('<Button') && line.includes("t('common:back')"))
  .map(line => line.match(/<Button\b[^\n]*?variant="(\w+)"/)?.[1] ?? 'primary')

describe("TRAK-570: a match's step Back looks as Training's", () => {
  it("Training's plan session Back is secondary", () => {
    expect(backVariants('src/pages/coach/training/Planner.tsx')).toEqual(['secondary', 'secondary'])
  })

  it.each(['src/components/coach/games/GamePlan.tsx', 'src/components/coach/games/Evaluation.tsx'])('%s: Back is secondary too', file => {
    expect(backVariants(file)).toEqual(['secondary'])
  })
})
