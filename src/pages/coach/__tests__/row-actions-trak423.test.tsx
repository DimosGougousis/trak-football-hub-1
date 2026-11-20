/**
 * TRAK-423 (walk-through of 11 Nov): one look for a row's small actions. "Assess" and "Finish draft" are Arc's small
 * button wherever they appear, the same button as the week's actions on Home's Needs you ("Take register"). Squad's row
 * tag is a state ("Due"), not a second Assess. Edit is the pencil, never the word. Test people are named after footballers.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { Button } from '@/components/arc/button/button'
import { NEXT_STEP_SIZE, NEXT_STEP_WIDTH } from '@/components/coach/next-step'
import { NeedsYou } from '@/components/coach/home/NeedsYou'
import { PlanReview } from '@/components/arc/blocks/plan-review/plan-review'
import type { NeedsYouItem } from '@/lib/coach-needs-you'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table } from '../../../../tests/msw/supabase'

afterEach(cleanup)

/** The classes Arc's Button gives a size and an extra class: what the week's card actions are made of. */
function lookOf(extra?: string, size: 'sm' | 'md' = 'sm') {
  const { unmount } = render(<Button size={size} className={extra}>x</Button>)
  const classes = screen.getByRole('button', { name: 'x' }).className
  unmount()
  return classes
}

const player = (name: string, kind: NeedsYouItem['kind']): NeedsYouItem =>
  ({ playerId: name, name, detail: '', kind, reason: kind === 'draft' ? 'Draft from Mon 9 Nov' : 'Never assessed', urgent: false, at: 0 })

describe('TRAK-423: Needs you', () => {
  // TRAK-497 (Imad, 20 Nov): the week's next step is now the medium (44 px) button; Assess still matches it.
  it("a player's Assess and Finish draft are the week's next-step button, one per card, named for the player", () => {
    const week = lookOf(NEXT_STEP_WIDTH, NEXT_STEP_SIZE)
    render(<NeedsYou items={[player('Angelos Basinas', 'assess'), player('Giourkas Seitaridis', 'draft')]}
      events={[{ id: 'e1', title: 'Training', when: 'Mon', squad: null, reason: 'Register to take',
        action: <Button size={NEXT_STEP_SIZE} className={NEXT_STEP_WIDTH}>Take register</Button> }]}
      failed={false} onRetry={() => {}} onOpen={() => {}} />)
    const assess = screen.getByRole('button', { name: 'Assess Angelos Basinas' })
    const draft = screen.getByRole('button', { name: 'Finish draft: Giourkas Seitaridis' })
    expect(assess).toHaveTextContent(/^Assess$/)
    expect(draft).toHaveTextContent(/^Finish draft$/)
    expect(assess.className).toBe(week)
    expect(draft.className).toBe(week)
    expect(screen.getByRole('button', { name: 'Take register' }).className).toBe(week)
    for (const card of screen.getAllByRole('listitem')) expect(within(card).getAllByRole('button')).toHaveLength(1)
  })
})

describe("TRAK-423: a player's page and Squad", () => {
  const coach = () => {
    const COACH = { id: 'coach-423' }
    signInAs(COACH)
    server.use(
      table('profiles', [{ id: 'p-423', user_id: COACH.id, role: 'coach', full_name: 'Coach Synthetic', invite_code: null }]),
      table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16s', current_club: null, organization_id: null }]),
      table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Kostas Tsimikas', linked_player_id: 'child-1', position: 'Defender', shirt_number: 21, age_group: 'U16', status: 'active' }]),
      table('coach_assessments', []), table('coach_shared_feedback', []), table('coach_assessment_notes', []),
      table('coach_sessions', []), table('squad_player_profiles', []),
      rpc('coach_squad_player_consent_required', () => false),
      rpc('feature_on', () => false),
      rpc('coach_squad_season', () => []),
      rpcRows('coach_player_birth_dates', []),
    )
  }

  it("a player's page: Assess is the same small button, named for the player", async () => {
    coach()
    const small = lookOf()
    renderApp('/coach/squad/player/sp-1')
    const assess = await screen.findByRole('button', { name: 'Assess Kostas' })
    expect(assess).toHaveTextContent(/^Assess$/)
    // Arc's own classes first; anything after them is where it sits on the page, not how it looks.
    expect(assess.className.startsWith(small)).toBe(true)
  })
  // Squad's row tag ("Due", not "Assess") is checked in squad-views-trak250, which has a player owed an assessment.
})

describe('TRAK-423: Edit is the pencil', () => {
  it("the match's Review & share rows: a pencil named for the part, no Edit word", () => {
    render(<PlanReview title="Game plan review" band={{ status: 'good', label: 'Ready to share' }}
      rows={[{ id: 'logistics', label: 'Logistics', status: 'good', onEdit: () => {} }]} />)
    const edit = screen.getByRole('button', { name: 'Edit logistics' })
    expect(edit).toHaveTextContent(/^$/)
    expect(edit.querySelector('svg')).not.toBeNull()
  })
})
