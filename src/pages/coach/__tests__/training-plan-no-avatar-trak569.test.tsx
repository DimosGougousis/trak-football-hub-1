/**
 * TRAK-569 (phone review, 23 Nov): on a phone, a training's plan session page shows no coach avatar (the button that
 * opens the side menu); its trail stays, as on a match's page. Training's own list keeps the avatar. Test people are
 * named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'

const COACH = { id: 'coach-569' }
const start = Math.ceil((Date.now() + 86_400_000) / 60_000) * 60_000
const TRAINING = {
  id: 'soon', coach_user_id: COACH.id, squad: 'U16', title: 'Training soon', event_type: 'training', published: true, status: 'scheduled',
  starts_at: new Date(start).toISOString(), ends_at: new Date(start + 90 * 60_000).toISOString(),
  event_date: new Date(start).toISOString().slice(0, 10), start_time: `${new Date(start).toISOString().slice(11, 16)}:00`,
  venue: 'Pitch 2', family_note: null, kit: null, meet_time: null,
}

beforeEach(() => {
  signInAs(COACH)
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, ({ request }) => {
      const id = new URL(request.url).searchParams.get('id')?.match(/^eq\.(.*)$/)?.[1]
      return HttpResponse.json(id && id !== TRAINING.id ? [] : [TRAINING])
    }),
    table('training_plans', []), table('training_plan_practices', []), table('coach_sessions', []),
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Jürgen Klopp', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active' }]),
    table('session_attendance', []), table('event_absences', []), table('coach_drills', []), table('coach_drill_bookmarks', []),
    table('training_notes', []), table('training_plan_drafts', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { cleanup(); localStorage.clear() })

describe("TRAK-569: no coach avatar on a training's plan session page", { timeout: 30_000 }, () => {
  it('Training plan tab on a phone: the page, and no Open menu avatar', async () => {
    renderApp('/coach/training/soon?tab=plan')
    expect(await screen.findByRole('heading', { level: 1, name: 'Training soon' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Training plan' })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
  })

  it('TRAK-572: the View page on a phone: no Open menu avatar either', async () => {
    renderApp('/coach/training/soon/view')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
  })

  it("Training's list on a phone still has the avatar", async () => {
    renderApp('/coach/training')
    expect(await screen.findByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })
})
