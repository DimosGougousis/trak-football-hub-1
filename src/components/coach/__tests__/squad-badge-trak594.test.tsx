/** TRAK-594–598 (Kostas, 25 Nov): the squad badge beside a coach page's title ("U18") shows only where the side menu,
 *  and its squad picker, is off screen. A laptop has the picker, so the badge goes; a phone keeps it; paper keeps it. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SquadBadge } from '@/components/coach/pitch-ready'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'

const realMatchMedia = window.matchMedia
const screenIs = (laptop: boolean) => {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
}
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia })

describe('the squad badge beside the title', () => {
  it('shows on a phone', () => {
    screenIs(false)
    render(<SquadBadge>U18</SquadBadge>)
    const badge = screen.getByText('U18')
    expect(badge.className).toMatch(/(^| )inline-flex( |$)/)
    expect(badge.className).not.toMatch(/(^| )hidden( |$)/)
  })

  it('is hidden on a laptop, where the side menu names the squad, but kept when the page is printed', () => {
    screenIs(true)
    render(<SquadBadge>U18 · 26 players</SquadBadge>)
    const badge = screen.getByText('U18 · 26 players')
    expect(badge.className).toMatch(/(^| )hidden( |$)/)
    expect(badge.className).toMatch(/print:inline-flex/)
    // Only the print rule shows it: no plain inline-flex fighting "hidden".
    expect(badge.className).not.toMatch(/(^| )inline-flex( |$)/)
  })
})

describe('every coach page uses it', () => {
  const read = (path: string) => readFileSync(join(__dirname, '..', '..', '..', path), 'utf8')
  it.each([
    ['Events', 'pages/coach/CoachSchedule.tsx'],
    ['Squad', 'pages/coach/CoachSquadPage.tsx'],
    ['Matches', 'pages/coach/CoachGames.tsx'],
    ['Training', 'pages/coach/training/CoachTraining.tsx'],
    ['Season plan', 'components/coach/season-plan/PlanView.tsx'],
  ])('%s', (_page, path) => {
    const source = read(path)
    expect(source).toMatch(/<SquadBadge>/)
    expect(source).not.toMatch(/SQUAD_PILL|className=\{BADGE\}/)
  })

  it("Season plan's set-up line drops the squad on a laptop and keeps the state", () => {
    expect(read('pages/coach/CoachSeasonPlan.tsx')).toMatch(/\{sideMenu \? '' : `\$\{squad\} · `\}\{sharedOn/)
  })
})
