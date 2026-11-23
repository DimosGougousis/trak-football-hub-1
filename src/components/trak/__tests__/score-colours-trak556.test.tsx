import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoachAssessmentCard } from '@/components/coach/CoachAssessmentCard'
import { CategoryBar } from '@/components/trak/CategoryBar'
import { BandPill } from '@/components/trak/BandPill'
import { AssessmentBands } from '@/components/player/AssessmentBands'
import { ParentAssessmentBands } from '@/components/parent/ParentFamily'
import type { ParentAssessment } from '@/lib/parent-data'
import { scoreColor } from '@/lib/rating-engine'

// TRAK-556 (Imad, 23 Nov, Option 3): a bar shows its score's colour for the coach, the player and the parent; a band's
// pill keeps its band's colour. TRAK-557 (Imad, 23 Nov): the word beside a bar is black (Trak's ink), not a shade.
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const SCORES = { work_rate: 10, tactical: 8, attitude: 6, technical: 4, physical: 2, coachability: 0 }
const FILL = ['#5B21B6', '#10B981', '#84CC16', '#F59E0B', '#EA580C', '#DC2626']
const WORD = ['Exceptional', 'Good', 'Steady', 'Developing', 'Difficult', 'Difficult']

/** Each bar's fill, and each word beside a bar with its own colour (none) and whether it takes Trak's ink. */
function bars(container: HTMLElement) {
  const fills = [...container.querySelectorAll<HTMLElement>('div[style*="width"]')].map(el => el.style.backgroundColor || el.style.background)
  const words = [...container.querySelectorAll<HTMLElement>('span')].filter(el => el.children.length === 0 && WORD.includes(el.textContent ?? ''))
  return { fills, words: words.map(el => [el.textContent, el.style.color, el.classList.contains('text-ink')]) }
}
const INK_WORDS = WORD.map(w => [w, '', true])

describe('TRAK-556: one score, one colour', () => {
  it('rounds an average as it is shown before it picks a colour', () => {
    expect(scoreColor(6.6)).toBe('#22C55E')
    expect(scoreColor(6.45)).toBe('#22C55E')
    expect(scoreColor(9.5)).toBe('#5B21B6')
  })

  it("the coach's assessment card bars", () => {
    const { container } = render(<div>{Object.entries(SCORES).map(([k, s]) => <CategoryBar key={k} label={k} score={s} />)}</div>)
    const { fills, words } = bars(container)
    expect(fills).toEqual(FILL.map(rgb))
    expect(words).toEqual(INK_WORDS)
  })

  it("the player's assessment bars", () => {
    const { container } = render(<AssessmentBands scores={SCORES} />)
    const { fills, words } = bars(container)
    expect(fills).toEqual(FILL.map(rgb))
    expect(words).toEqual(INK_WORDS)
  })

  it("the parent's assessment bars", () => {
    const { container } = render(<ParentAssessmentBands assessment={SCORES as unknown as ParentAssessment} />)
    const { fills, words } = bars(container)
    expect(fills).toEqual(FILL.map(rgb))
    expect(words).toEqual(INK_WORDS)
  })

  it("the coach's assessment card shows its overall band in the band's pill (TRAK-557)", () => {
    const { container } = render(<MemoryRouter><CoachAssessmentCard assessment={{ id: 'as-557', created_at: '2026-11-22T10:00:00Z',
      published_at: '2026-11-22T10:00:00Z', work_rate: 8, tactical: 8, attitude: 8, technical: 8, physical: 8, coachability: 7 }} /></MemoryRouter>)
    const pills = [...container.querySelectorAll<HTMLElement>('span[style*="background"]')].filter(el => el.textContent === 'Good')
    const css = (c: string) => c.startsWith('#') ? rgb(c) : c // jsdom keeps a border's hex as written
    expect(pills.map(el => [css(el.style.background || el.style.backgroundColor), css(el.style.borderColor)])).toEqual([[rgb('#DCFCE7'), rgb('#15803D')]])
  })

  it("a band's pill keeps its band's colour, with white words on violet and crimson", () => {
    const pill = (band: 'exceptional' | 'good' | 'difficult') => render(<BandPill band={band} />).container.firstElementChild as HTMLElement
    expect([pill('exceptional').style.backgroundColor, pill('exceptional').style.color]).toEqual([rgb('#5B21B6'), rgb('#FFFFFF')])
    expect([pill('good').style.backgroundColor, pill('good').style.color]).toEqual([rgb('#22C55E'), rgb('#000000')])
    expect([pill('difficult').style.backgroundColor, pill('difficult').style.color]).toEqual([rgb('#DC2626'), rgb('#FFFFFF')])
  })
})
