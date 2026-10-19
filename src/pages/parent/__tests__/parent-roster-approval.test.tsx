/**
 * TRAK-11 phase 4 (J2/J3): a guardian the academy rostered approves a child
 * who has no account yet, and Trak then emails the child. Real App, router,
 * AuthProvider and Supabase SDK, with synthetic intercepted HTTP. The database
 * rules (who may consent, who may be emailed) are proven in SQL
 * (roster_consent_before_account.sql, roster_invite_targets.sql).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { supabase } from '@/integrations/supabase/client'
import { CONSENT_NOTICE_VERSION, consentStatement } from '@/lib/consent'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'

const endpoint = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`
const inviteUrl = `${SUPABASE_URL}/functions/v1/send-roster-invites`
const ana = { roster_child_id: '98b00000-0000-4000-8000-000000000070', first_name: 'Ana', age_years: 12 }
const consentId = '98b00000-0000-4000-8000-000000000099'

let sequence = 0
let session: Session
let rosterWaiting: unknown[]
let rosterReadStatus: number
let grants: unknown[]
let invites: unknown[]
let inviteReplies: { status: number; body: Record<string, unknown> }[]

function newSession(): Session {
  const id = `98b00000-0000-4000-8000-${String(100 + ++sequence).padStart(12, '0')}`
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: id, exp: expiresAt, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
    + '.' + Buffer.from('synthetic-signature').toString('base64url')
  return {
    access_token: token, refresh_token: `synthetic-${id}`, token_type: 'bearer', expires_in: 3600, expires_at: expiresAt,
    user: { id, email: `guardian-${sequence}@roster.test.invalid`, aud: 'authenticated', role: 'authenticated',
      app_metadata: { provider: 'email' }, user_metadata: {},
      email_confirmed_at: '2026-09-27T08:00:00Z', created_at: '2026-09-27T08:00:00Z' },
  }
}

async function open(path: string) {
  const result = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  expect(result.error).toBeNull()
  window.history.replaceState({}, '', path)
  render(<App />)
}

// TRAK-182: the consent bar's Approve opens the panel; the panel's Approve saves.
async function approveAna() {
  await screen.findByRole('heading', { name: 'Ana is waiting for your approval' })
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
  await screen.findByText(consentStatement('Ana'))
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
}

beforeEach(() => {
  vi.stubEnv('DEV', false)
  sessionStorage.clear()
  session = newSession()
  rosterWaiting = [ana]
  rosterReadStatus = 200
  grants = []
  invites = []
  inviteReplies = []
  server.use(
    http.get(`${SUPABASE_URL}/auth/v1/user`, () => HttpResponse.json(session.user)),
    http.get(endpoint('profiles'), () => HttpResponse.json({ id: 'profile', user_id: session.user.id, role: 'parent',
      full_name: 'Guardian Synthetic', nationality: null, avatar_url: null })),
    // Ana has no account yet, so the guardian has no linked child.
    http.get(endpoint('player_parent_links'), () => HttpResponse.json([])),
    http.post(endpoint('telemetry_events'), () => HttpResponse.json(null, { status: 201 })),
    http.post(endpoint('rpc/get_children_awaiting_consent'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_roster_children_awaiting_consent'), () => rosterReadStatus === 200
      ? HttpResponse.json(rosterWaiting)
      : HttpResponse.json({ code: 'PGRST000', message: 'Synthetic roster read unavailable', details: null, hint: null }, { status: rosterReadStatus })),
    http.post(endpoint('rpc/record_roster_consent'), async ({ request }) => {
      const grant = await request.json() as { p_roster_child_id: string }
      grants.push(grant)
      rosterWaiting = rosterWaiting.filter(child => (child as typeof ana).roster_child_id !== grant.p_roster_child_id)
      return HttpResponse.json(consentId)
    }),
    http.post(inviteUrl, async ({ request }) => {
      invites.push(await request.json())
      const reply = inviteReplies.shift() ?? { status: 200, body: { sent: 1, failed: 0, results: [{ kind: 'child', sent: true, via: 'invite' }] } }
      return HttpResponse.json(reply.body, { status: reply.status })
    }),
  )
})

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('TRAK-11 phase 4: approving a child who has no account yet', () => {
  it('TRAK-166 shows the approved events notice and records its new version', async () => {
    const eventsNotice = "Events: your child's training and match schedule is shown in the app and, if you choose, in your phone's calendar through a private link. We email you when an event is added, changed or cancelled, two days before. You can turn the reminder off in Settings."
    await open('/parent/consent')
    await screen.findByRole('heading', { name: 'Ana is waiting for your approval' })
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByText(eventsNotice, { exact: false })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(grants).toHaveLength(1))
    expect(grants[0]).toMatchObject({
      p_notice_version: '2026-10-19.1',
      p_consent_text: expect.stringContaining(eventsNotice),
    })
  })

  // TRAK-182 (Imad, 16 Oct): on Home it is Arc's consent bar, not a banner that opens a page.
  it('asks on Home with a bar at the bottom, and approving there stays on Home', async () => {
    await open('/parent/home')
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
    expect(screen.queryByText('Ana is waiting on your approval')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await screen.findByText(consentStatement('Ana'))
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(grants).toHaveLength(1))
    expect(await screen.findByText("We've emailed Ana an invitation to join.")).toBeInTheDocument()
    expect(window.location.pathname).toBe('/parent/home')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    // Approved: gone completely, with no reopen button either.
    await waitFor(() => expect(screen.queryByText("Approve Ana's Trak account?")).toBeNull())
    expect(screen.queryByText(/We've emailed Ana/)).toBeNull()
    expect(screen.queryByRole('button', { name: "Review Ana's approval" })).toBeNull()
    expect(invites).toHaveLength(1)
  })

  it('on Home, X closes the details and Reject folds the bar into a reopen button', async () => {
    await open('/parent/home')
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
    await screen.findByText(consentStatement('Ana'))
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const reopen = await screen.findByRole('button', { name: "Review Ana's approval" })
    expect(screen.queryByText("Approve Ana's Trak account?")).toBeNull()
    expect(grants).toEqual([])
    await userEvent.click(reopen)
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
  })

  // Kostas's and Tarek's #329 review: each sibling is asked on their own; refusing one never blocks the other.
  it('with two children waiting, Reject on the first moves to the second, and only the second is approved', async () => {
    const bo = { roster_child_id: '98b00000-0000-4000-8000-000000000071', first_name: 'Bo', age_years: 13 }
    rosterWaiting = [ana, bo]
    await open('/parent/home')
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
    expect(screen.getByText('1 of 2 waiting')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(await screen.findByText("Approve Bo's Trak account?")).toBeInTheDocument()
    expect(screen.getByText('2 of 2 waiting')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await screen.findByText(consentStatement('Bo'))
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(grants).toHaveLength(1))
    expect(grants[0]).toMatchObject({ p_roster_child_id: bo.roster_child_id, p_consent_text: consentStatement('Bo') })
    // Kostas's #329 note: the bar moves on or folds, so the saved approval is said in a toast.
    expect(await screen.findByText('Approval saved for Bo.')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }))
    // Ana was put off this visit: the bar folds, and the button brings her back.
    await userEvent.click(await screen.findByRole('button', { name: "Review Ana's approval" }))
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
    expect(grants).toHaveLength(1)
  })

  it('folds only after every waiting child is put off, and reopens at the first', async () => {
    const bo = { roster_child_id: '98b00000-0000-4000-8000-000000000071', first_name: 'Bo', age_years: 13 }
    rosterWaiting = [ana, bo]
    await open('/parent/home')
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await screen.findByText("Approve Bo's Trak account?")
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Review approvals' }))
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
    expect(grants).toEqual([])
  })

  it('shows no bar on Home when no child is waiting', async () => {
    rosterWaiting = []
    await open('/parent/home')
    await waitFor(() => expect(window.location.pathname).toBe('/parent/home'))
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(screen.queryByText(/Trak account\?/)).toBeNull()
    expect(screen.queryByRole('button', { name: /approval/ })).toBeNull()
  })

  it('records the consent against the roster place, then asks Trak to email the child once', async () => {
    await open('/parent/consent')
    await approveAna()
    await waitFor(() => expect(grants).toEqual([{
      p_roster_child_id: ana.roster_child_id,
      p_relationship: 'parent',
      p_purposes: { coaching_records: true, recognition: false },
      p_notice_version: CONSENT_NOTICE_VERSION,
      p_consent_text: consentStatement('Ana'),
    }]))
    expect(await screen.findByText("We've emailed Ana an invitation to join.")).toBeInTheDocument()
    expect(invites).toEqual([{ roster_child_id: ana.roster_child_id }])
  })

  it('lets the guardian send the invitation again, and says so when it fails', async () => {
    await open('/parent/consent')
    inviteReplies = [
      { status: 502, body: { sent: 0, failed: 1, results: [{ kind: 'child', sent: false, reason: 'delivery_failed' }] } },
    ]
    await approveAna()
    expect(await screen.findByText("We couldn't email Ana yet.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send again' }))
    expect(await screen.findByText("We've emailed Ana an invitation to join.")).toBeInTheDocument()
    expect(invites).toHaveLength(2)
    expect(grants).toHaveLength(1)
  })

  it('shows a failed read as a failure, never as nothing to approve', async () => {
    rosterReadStatus = 503
    await open('/parent/consent')
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load pending approvals")
    expect(screen.queryByText('Nothing to approve')).not.toBeInTheDocument()
  })
})

// TRAK-182 (Imad's 6a wording, 15 Oct): the consent bar.
describe('TRAK-182: the consent bar', () => {
  it("asks in the bar, and the panel carries Imad's wording and the statement it stores", async () => {
    await open('/parent/consent')
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
    expect(screen.getByText('Their coach records how they train and play, and you see their progress.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByText('Coaching records')).toBeInTheDocument()
    expect(screen.getByText('Always on with approval')).toBeInTheDocument()
    expect(screen.getByText('Their coach records their progress, logs their matches and can write feedback. You see their bands and history. Their coach can also keep private notes, which are never shared.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Recognition awards/ })).not.toBeChecked()
    expect(screen.getByText('Things like player of the week, seen by you and Ana.')).toBeInTheDocument()
    expect(screen.getByText("By approving, you confirm you're Ana's parent or legal guardian and agree to the choices above. You can withdraw any time in settings, which stops new records.", { exact: false })).toBeInTheDocument()
    // Escape steps back to the bar without saving anything.
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
    expect(grants).toEqual([])
  })

  it('Reject records nothing and says the child stays waiting', async () => {
    await open('/parent/consent')
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Not approved. Ana stays waiting, and nothing about them is recorded.')
    expect(grants).toEqual([])
    expect(invites).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Review again' }))
    expect(await screen.findByText("Approve Ana's Trak account?")).toBeInTheDocument()
  })
})

it('TRAK-182: toggling the awards switch keeps focus on the switch', async () => {
  await open('/parent/consent')
  await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
  const awards = await screen.findByRole('switch', { name: /Recognition awards/ })
  await userEvent.click(awards)
  expect(awards).toBeChecked()
  expect(awards).toHaveFocus()
})
