import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { parentAlerts, type ParentDevelopment } from '../parent-data'
import { PlayerAlertsBell } from '@/components/player/PlayerAlertsBell'

// TRAK-202 (Imad, 18 Oct): the assessment alert reads "New assessment from
// Coach <name>" in the parent's bell and the player's bell. With no name on
// the coach's profile it says "your coach", never "Coach Coach". Player Home
// passing the coach's name in: player-assessment-bell-trak171.test.tsx.

const development = (coachNames: Record<string, string>): ParentDevelopment => ({
  details: null, awards: [], coachNames,
  assessments: [{ id: 'as-1', coach_user_id: 'coach-1', coach_rating: 7.5, created_at: '2026-10-12T10:00:00Z' }] as ParentDevelopment['assessments'],
})
const assessmentAlert = (coachNames: Record<string, string>) =>
  parentAlerts([], development(coachNames), { awards: false }).find(a => a.kind === 'assessment')!

describe("TRAK-202: the parent's bell", () => {
  it('names the coach in the title; the second line is the band, with no "by"', () => {
    const alert = assessmentAlert({ 'coach-1': 'Angelos Basinas' })
    expect(alert.title).toBe('New assessment from Coach Angelos Basinas')
    expect(alert.description).toBe('Good') // the band's word, not its key (Imad, 19 Oct)
  })

  it('an unrated assessment still says "Not assessed"', () => {
    const dev = development({})
    dev.assessments[0].coach_rating = null
    expect(parentAlerts([], dev, { awards: false })[0].description).toBe('Not assessed')
  })

  // fetchCoachNames turns an empty full_name into 'Coach'.
  it.each<Record<string, string>>([{}, { 'coach-1': 'Coach' }, { 'coach-1': '  ' }])('says "your coach" when the name is unknown: %o', coachNames => {
    expect(assessmentAlert(coachNames).title).toBe('New assessment from your coach')
  })
})

describe("TRAK-202: the player's bell", () => {
  afterEach(cleanup)
  const bell = async (coachName: string) => {
    render(<MemoryRouter><PlayerAlertsBell userId="player-1" events={[]}
      assessment={{ id: 'as-1', userId: 'player-1', publishedAt: '2026-10-13T10:00:00Z', coachName }} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }))
    return screen.findByRole('dialog', { name: 'Alerts' })
  }

  it('names the coach', async () => {
    expect(within(await bell('Angelos Basinas')).getByText('New assessment from Coach Angelos Basinas')).toBeInTheDocument()
  })

  it('says "your coach" with no name', async () => {
    expect(within(await bell('')).getByText('New assessment from your coach')).toBeInTheDocument()
  })
})
