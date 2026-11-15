/**
 * TRAK-177 (G1/J2): at an academy whose consent age is 15, a player aged
 * 15–17 gives their own consent on Home (no guardian needed); they can also
 * decline, which keeps Trak from recording their progress. Below the consent
 * age, or at an academy at 18, the player still waits for a parent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows } from '../../../../tests/msw/supabase'

vi.mock('@/components/player/PlayerConsentWatcher', () => ({ PlayerConsentWatcher: () => null }))

let status: Record<string, unknown>
let calls: { fn: string; args: Record<string, unknown> }[]

function setup(id: string, initial: Record<string, unknown>) {
  status = { required: true, invited_parent: null, threshold: 18, own_choice: null, ...initial }
  calls = []
  signInAs({ id })
  server.use(
    table('profiles', [{ id: 'p', user_id: id, role: 'player', full_name: 'Nikos Synthetic' }]),
    table('matches', []), table('player_details', []), table('squad_players', []),
    table('coach_assessments', []), table('coach_shared_feedback', []),
    rpcRows('child_events', []), table('recognition_awards', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => status),
    rpc('give_my_consent', args => { calls.push({ fn: 'give', args }); status = { ...status, required: false, own_choice: true }; return null }),
    rpc('withdraw_my_consent', args => { calls.push({ fn: 'withdraw', args }); status = { ...status, required: true, own_choice: false }; return null }),
  )
}

beforeEach(() => { calls = [] })

describe('TRAK-177: a 15–17 player\'s own consent', () => {
  it('asks the player themselves, and agreeing records it with the notice version', async () => {
    setup('player-own-15', { age: 15, consent_age: 15 })
    renderApp('/player/home')
    // TRAK-182: a bar first; Approve opens the panel with the stored text.
    expect(await screen.findByText('Your coach would like to record your progress in Trak.')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for your parent')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('heading', { name: 'Your consent' })).toBeInTheDocument()
    expect(calls).toHaveLength(0)
    const agree = screen.getByRole('button', { name: 'Approve' })
    expect(agree).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /I understand/ }))
    await userEvent.click(agree)
    expect(await screen.findByText(/Thanks, your coach can now record your progress/)).toBeInTheDocument()
    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe('give')
    expect(calls[0].args.p_notice_version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+-own$/)
    expect(String(calls[0].args.p_consent_text)).toMatch(/coaching records/)
  })

  /* TRAK-135 (Kostas's wording, Imad agreed 21 Oct): a player who consents for
     themselves gets event emails, so their own text says so, as the guardian's
     does since TRAK-166. */
  it('shows the events line in the player\'s own words and records its new version', async () => {
    const eventsLine = "Events: my training and match schedule is shown in the app and, if I choose, in my phone's calendar through a private link. Trak emails me when an event is added, changed or cancelled, and again two days before it. I can turn the reminder off in Settings."
    setup('player-own-17', { age: 17, consent_age: 15 })
    renderApp('/player/home')
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getByText(eventsLine, { exact: false })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /I understand/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/Thanks, your coach can now record your progress/)).toBeInTheDocument()
    expect(calls[0].args).toMatchObject({
      p_notice_version: '2026-10-21.1-own',
      p_consent_text: expect.stringContaining(eventsLine),
    })
  })

  it('lets the player decline, and says what that means', async () => {
    setup('player-own-16', { age: 16, consent_age: 15 })
    renderApp('/player/home')
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(await screen.findByText(/won't record your progress in Trak/)).toBeInTheDocument()
    expect(calls.map(c => c.fn)).toEqual(['withdraw'])
  })

  it('keeps a 14-year-old at the same academy waiting for a parent', async () => {
    setup('player-own-14', { age: 14, consent_age: 15 })
    renderApp('/player/home')
    expect(await screen.findByText('Waiting for your parent')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your consent' })).not.toBeInTheDocument()
  })

  it('keeps a 16-year-old at an academy at 18 waiting for a parent', async () => {
    setup('player-own-uae', { age: 16, consent_age: 18 })
    renderApp('/player/home')
    expect(await screen.findByText('Waiting for your parent')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your consent' })).not.toBeInTheDocument()
  })

  it('lets a player who agreed withdraw in Settings, after confirming', async () => {
    setup('player-own-settings', { age: 16, consent_age: 15, required: false, own_choice: true })
    server.use(rpc('my_calendar_link', () => []), rpc('my_notification_settings', () => ({ event_reminders: true })))
    renderApp('/settings')
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw my consent' }))
    expect(calls).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Yes, withdraw' }))
    expect(await screen.findByText(/You withdrew your consent/)).toBeInTheDocument()
    expect(calls.map(c => c.fn)).toEqual(['withdraw'])
  })

  it('shows nothing about own consent in Settings to a player whose parent decides', async () => {
    setup('player-own-settings-14', { age: 14, consent_age: 15, required: false, own_choice: null })
    server.use(rpc('my_calendar_link', () => []), rpc('my_notification_settings', () => ({ event_reminders: true })))
    renderApp('/settings')
    // TRAK-261: Calendar is a section of Arc's settings page (its menu names it too).
    await screen.findByRole('heading', { name: 'Calendar' })
    expect(screen.queryByRole('button', { name: 'Withdraw my consent' })).not.toBeInTheDocument()
  })

  it('asks a player who turned 15 under a parent\'s approval to make their own choice', async () => {
    setup('player-own-turned', { age: 15, consent_age: 15, required: false, own_choice: null })
    renderApp('/player/home')
    expect(await screen.findByText('Your coach would like to record your progress in Trak.')).toBeInTheDocument()
    expect(screen.getByText(/You're 15 or over now/)).toBeInTheDocument()
  })
})
