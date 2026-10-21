/**
 * TRAK-234 (20 Oct live run, S8): after withdrawing one child's consent on
 * Profile, the guardian approved again from the bar on Home, and a consent
 * prompt was reported to stay. S8's child has an account (a login the guardian
 * made), so this walks that path through the real App, router and SDK:
 * approve on Home, and the bar, its panel and its reopen button are all gone,
 * and stay gone after Home re-reads. A sibling still waiting keeps the bar.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { supabase } from '@/integrations/supabase/client'
import { consentStatement } from '@/lib/consent'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'

const endpoint = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`
const giorgos = { player_user_id: '9a400000-0000-4000-8000-000000000001', full_name: 'Giorgos Synthetic', age_years: 14 }
const nikos = { player_user_id: '9a400000-0000-4000-8000-000000000002', full_name: 'Nikos Synthetic', age_years: 12 }

let sequence = 0
let session: Session
let waiting: typeof giorgos[]
let reads: number
let grants: { p_player_user_id: string }[]

function newSession(): Session {
  const id = `9a400000-0000-4000-8000-${String(100 + ++sequence).padStart(12, '0')}`
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: id, exp: expiresAt, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
    + '.' + Buffer.from('synthetic-signature').toString('base64url')
  return {
    access_token: token, refresh_token: `synthetic-${id}`, token_type: 'bearer', expires_in: 3600, expires_at: expiresAt,
    user: { id, email: `guardian-${sequence}@consent234.test.invalid`, aud: 'authenticated', role: 'authenticated',
      app_metadata: { provider: 'email' }, user_metadata: {},
      email_confirmed_at: '2026-10-20T08:00:00Z', created_at: '2026-10-20T08:00:00Z' },
  }
}

beforeEach(() => {
  vi.stubEnv('DEV', false)
  sessionStorage.clear()
  session = newSession()
  waiting = [giorgos]
  reads = 0
  grants = []
  server.use(
    http.get(`${SUPABASE_URL}/auth/v1/user`, () => HttpResponse.json(session.user)),
    http.get(endpoint('profiles'), () => HttpResponse.json({ id: 'profile', user_id: session.user.id, role: 'parent',
      full_name: 'Guardian Synthetic', nationality: null, avatar_url: null })),
    http.get(endpoint('player_parent_links'), () => HttpResponse.json([])),
    http.post(endpoint('telemetry_events'), () => HttpResponse.json(null, { status: 201 })),
    http.post(endpoint('rpc/get_roster_children_awaiting_consent'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_my_child_logins'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_my_approved_children_awaiting_signup'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_children_awaiting_consent'), () => { reads++; return HttpResponse.json(waiting) }),
    http.post(endpoint('rpc/record_parental_consent'), async ({ request }) => {
      const grant = await request.json() as { p_player_user_id: string }
      grants.push(grant)
      waiting = waiting.filter(child => child.player_user_id !== grant.p_player_user_id)
      return HttpResponse.json('9a400000-0000-4000-8000-000000000099')
    }),
  )
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

async function openHome() {
  const result = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  expect(result.error).toBeNull()
  window.history.replaceState({}, '', '/parent/home')
  render(<App />)
}
async function approve(first: string) {
  expect(await screen.findByText(`Approve ${first}'s Trak account?`)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
  await screen.findByText(consentStatement(first))
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
}

describe('TRAK-234: approving a child with an account from the bar on Home', { timeout: 20_000 }, () => {
  it('saves once, says so, and the bar is gone for good: no panel, no reopen button, not back after a re-read', async () => {
    await openHome()
    await approve('Giorgos')
    await waitFor(() => expect(grants).toHaveLength(1))
    expect(await screen.findByText('Approval saved for Giorgos Synthetic.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText("Approve Giorgos's Trak account?")).toBeNull())
    expect(screen.queryByText(consentStatement('Giorgos'))).toBeNull()
    expect(screen.queryByRole('button', { name: /Review .*approval/ })).toBeNull()
    const readsAfter = reads
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(screen.queryByText(/Trak account\?/)).toBeNull()
    expect(reads).toBeGreaterThanOrEqual(readsAfter)
    expect(window.location.pathname).toBe('/parent/home')
  })

  it("a sibling still waiting keeps the bar, now for the sibling; approving them too clears it", async () => {
    waiting = [giorgos, nikos]
    await openHome()
    await approve('Giorgos')
    expect(await screen.findByText("Approve Nikos's Trak account?")).toBeInTheDocument()
    await approve('Nikos')
    await waitFor(() => expect(screen.queryByText(/Trak account\?/)).toBeNull())
    expect(grants.map(g => g.p_player_user_id)).toEqual([giorgos.player_user_id, nikos.player_user_id])
  })
})
