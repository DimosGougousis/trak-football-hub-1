/**
 * TRAK-408 (Languages 3/8, last part): the Drill Library's screens in Greek: the home, a drill's page and Change any
 * practice. The drills' own wording (names, kinds, how to play) is TRAK-409, so it stays English here. Test people
 * are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { i18n, showLanguage, SOURCE_LANGUAGE } from '@/lib/i18n'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { LIBRARY } from '@/lib/training/library'

const COACH = { id: 'coach-408-library' }

beforeEach(async () => {
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Otto Rehhagel', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U14', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, () => HttpResponse.json([])),
    table('coach_sessions', []), table('session_attendance', []), table('event_absences', []), table('training_plans', []),
    table('training_notes', []), table('training_plan_drafts', []), table('coach_drill_bookmarks', []), table('coach_drills', []),
    table('squad_players', Array.from({ length: 12 }, (_, i) => ({ id: `sp-${i}`, coach_user_id: COACH.id, player_name: `Player ${i}`, age_group: 'U14', status: 'active' }))),
    rpc('feature_on', () => true),
  )
  await showLanguage('el')
})
afterEach(async () => { cleanup(); await i18n.changeLanguage(SOURCE_LANGUAGE); localStorage.clear() })

describe('TRAK-408: the Drill Library in Greek', { timeout: 20_000 }, () => {
  it('the home: Find a drill, My drills, All drills and the kinds heading', async () => {
    renderApp('/coach/training/drills')
    expect(await screen.findByRole('heading', { name: 'Βρείτε άσκηση' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Αναζήτηση ασκήσεων' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Οι Ασκήσεις μου.*Τίποτα ακόμα/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(`Όλες οι ασκήσεις.*${LIBRARY.length} συνολικά`) })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Τι είδους εξάσκηση;' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Αλλάξτε οποιαδήποτε άσκηση' })).toBeInTheDocument()
  })

  it("a drill's page: Players today, Easier, Harder, its sections and Add to training", async () => {
    renderApp(`/coach/training/drills/d/${LIBRARY[0].id}`)
    expect(await screen.findByRole('group', { name: 'Παίκτες σήμερα' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Πιο εύκολο/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Πιο δύσκολο/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Γιατί λειτουργεί' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Πώς παίζεται' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Τι να προσέξετε' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Προσθήκη σε προπόνηση/ })).toBeInTheDocument()
    expect(screen.queryByText('Players today')).toBeNull()
  })

  // TRAK-409: the drill's own words too.
  it("a drill's page shows the drill's name, how to play and watch for in Greek", async () => {
    renderApp('/coach/training/drills/d/lib-keep-the-ball')
    expect(await screen.findByRole('heading', { level: 1, name: 'Κράτα τη μπάλα' })).toBeInTheDocument()
    expect(await screen.findByText('Οι επιθετικοί κρατούν τη μπάλα όσο περισσότερο μπορούν.')).toBeInTheDocument()
    expect(screen.getByText('Οι παίκτες κινούνται πριν την πάσα, όχι μετά.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Keep the ball' })).toBeNull()
  })

  it('Change any practice: its title and the five things in Greek', async () => {
    renderApp('/coach/training/drills/change')
    expect(await screen.findByRole('heading', { level: 1, name: 'Αλλάξτε οποιαδήποτε άσκηση' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Πέντε πράγματα που διαμορφώνουν μια άσκηση' })).toBeInTheDocument()
  })
})
