import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoachAssessmentCard } from '@/components/coach/CoachAssessmentCard'
import englishHome from '@/locales/en/coachHome.json'
import greekHome from '@/locales/el/coachHome.json'

/** TRAK-585 (Imad, 25 Nov): an assessment is shared with the player and parents again; TRAK-532's "Coach only" card
 *  is gone. An unpublished one is a Draft with Publish, whatever the squad; a published one says Published. Synthetic player. */
afterEach(cleanup)

const assessment = (published_at: string | null) => ({ id: 'as-1', created_at: '2026-11-23T10:00:00Z', published_at,
  work_rate: 7, tactical: 6, attitude: 8, technical: 6, physical: 7, coachability: 8 })
const show = (published_at: string | null) =>
  render(<MemoryRouter><CoachAssessmentCard assessment={assessment(published_at) as never} playerName="Alex Synthetic" /></MemoryRouter>)

describe('TRAK-585: the assessment card has no "Coach only"', () => {
  it('no card label says Coach only, in English or Greek', () => {
    expect(Object.values(englishHome)).not.toContain('Coach only')
    expect(Object.values(greekHome)).not.toContain('Μόνο ο προπονητής')
  })

  it('an unpublished one is a Draft with Publish', () => {
    show(null)
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Publish/ }).length).toBeGreaterThan(0)
    expect(screen.queryByText('Coach only')).toBeNull()
  })

  it('a published one says Published', () => {
    show('2026-11-20T10:00:00Z')
    expect(screen.getByRole('heading', { name: 'Published' })).toBeInTheDocument()
  })
})
