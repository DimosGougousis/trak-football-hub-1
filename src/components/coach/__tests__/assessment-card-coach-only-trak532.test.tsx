import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoachAssessmentCard } from '@/components/coach/CoachAssessmentCard'

/** TRAK-532 (Imad, 21 Nov): where the squad's plan is shared, an assessment stays with the coach. The card says "Coach
 *  only", with Edit behind it and no Publish; elsewhere an unpublished one is still a Draft. Synthetic player. */
afterEach(cleanup)

const assessment = (published_at: string | null) => ({ id: 'as-1', created_at: '2026-11-23T10:00:00Z', published_at,
  work_rate: 7, tactical: 6, attitude: 8, technical: 6, physical: 7, coachability: 8 })
const show = (published_at: string | null, coachOnly: boolean) =>
  render(<MemoryRouter><CoachAssessmentCard assessment={assessment(published_at) as never} playerName="Alex Synthetic" coachOnly={coachOnly} /></MemoryRouter>)

describe('TRAK-532: the card of an assessment kept with the coach', () => {
  it('says Coach only, with no Publish', () => {
    show(null, true)
    expect(screen.getByRole('heading', { name: 'Coach only' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull()
    expect(screen.queryByText('Draft')).toBeNull()
  })

  it('a squad without a shared plan keeps Draft and Publish', () => {
    show(null, false)
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Publish/ }).length).toBeGreaterThan(0)
  })

  it('one published before stays Published', () => {
    show('2026-11-20T10:00:00Z', true)
    expect(screen.getByRole('heading', { name: 'Published' })).toBeInTheDocument()
  })
})
