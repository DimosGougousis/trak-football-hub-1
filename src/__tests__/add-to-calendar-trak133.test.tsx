import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../tests/msw/server'
import { rpc } from '../../tests/msw/supabase'
import { CalendarHomePrompt, CalendarSettings } from '@/components/trak/AddToCalendar'

/**
 * TRAK-133 (J8.10): "Add Trak to my calendar" in one tap, on Home after
 * setup and in Settings. A personal link (TRAK-132) is shown only once and a
 * person has one, so a link is made only when the person taps an app, and the
 * same link serves every app tapped in that visit. Opening a screen never
 * makes one: that would silently stop a calendar they already added.
 */

const nav = vi.hoisted(() => ({ opened: [] as string[] }))
vi.mock('@/lib/calendar-link', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/calendar-link')>()),
  openCalendarLink: (url: string) => { nav.opened.push(url) },
}))
const auth = vi.hoisted(() => ({ user: { id: 'parent-cal', email: 'p@example.test', app_metadata: {} } as Record<string, unknown> }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, profile: { role: 'parent' } }),
}))
const PARENT = { id: 'parent-cal', email: 'p@example.test', app_metadata: {} }
// A guardian-created child login (TRAK-73): no mailbox, so never promised an email.
const CHILD_LOGIN = { id: 'child-cal', email: 'striker7@child.trakfootball.com', app_metadata: { trak_child_login: true } }

let created: number
let revoked: number
let link: { created_at: string; last_fetched_at: string | null } | null
let createFails: boolean

beforeEach(() => {
  nav.opened = []
  created = 0
  revoked = 0
  link = null
  createFails = false
  localStorage.clear()
  auth.user = PARENT
  server.use(
    rpc('my_calendar_link', () => (link ? [link] : [])),
    rpc('create_my_calendar_link', () => {
      if (createFails) return { status: 500, body: { message: 'Synthetic failure' } }
      created += 1
      return `token${created}${'x'.repeat(37)}`
    }),
    rpc('revoke_my_calendar_link', () => { revoked += 1; link = null; return true }),
  )
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function mount(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('J8.10 Settings → Calendar', () => {
  it('opening it makes no link; one tap makes one and opens that app', async () => {
    mount(<CalendarSettings />)
    expect(await screen.findByText('Not added yet')).toBeInTheDocument()
    expect(created).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Add to Apple Calendar' }))
    await waitFor(() => expect(nav.opened).toHaveLength(1))
    expect(created).toBe(1)
    expect(nav.opened[0]).toMatch(/^webcal:\/\/.+\/calendar-feed\/token1x+\.ics$/)
  })

  it('a second app in the same visit reuses that link, so the first keeps working', async () => {
    mount(<CalendarSettings />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Apple Calendar' }))
    await waitFor(() => expect(nav.opened).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Add to Google Calendar' }))
    await waitFor(() => expect(nav.opened).toHaveLength(2))
    expect(created).toBe(1)
    expect(decodeURIComponent(nav.opened[1])).toContain('/calendar-feed/token1')
  })

  it('a link that fails to make says so and opens nothing', async () => {
    createFails = true
    mount(<CalendarSettings />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Google Calendar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't make your calendar link/i)
    expect(nav.opened).toHaveLength(0)
  })

  it('with a link: when it last synced, a warning before replacing it, and "Get a new link" stops the old one', async () => {
    // A fixed midday, so "2 hours ago" is today on any runner's clock: from 00:00
    // to 02:00 it is yesterday, and the label rightly says so (Imad, 15 Oct).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T12:00:00'))
    link = { created_at: '2026-10-11T08:00:00Z', last_fetched_at: new Date('2026-10-14T10:00:00').toISOString() }
    mount(<CalendarSettings />)
    expect(await screen.findByText(/Last synced 2h ago/)).toBeInTheDocument()
    expect(screen.getByText(/stop updating/i)).toBeInTheDocument()
    expect(created).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Get a new link' }))
    await waitFor(() => expect(revoked).toBe(1))
    expect(await screen.findByText(/old link no longer works/i)).toBeInTheDocument()
    expect(created).toBe(0)
  })
})

describe('J8.10 the Home card after setup', () => {
  it('shows when the person has events and no calendar link yet', async () => {
    mount(<CalendarHomePrompt hasEvents />)
    const card = await screen.findByRole('region', { name: 'Add Trak to your calendar' })
    // Short on a phone (Kostas, #286): the device's own calendar, then the rest on request.
    expect(within(card).getAllByRole('button', { name: /^Add to / })).toHaveLength(1)
    await userEvent.click(within(card).getByRole('button', { name: 'Other calendar' }))
    for (const app of ['Apple Calendar', 'Google Calendar', 'Outlook']) {
      expect(within(card).getByRole('button', { name: `Add to ${app}` })).toBeInTheDocument()
    }
    expect(within(card).getByText(/same-day changes we also email you/i)).toBeInTheDocument()
  })

  it('stays away when there are no events yet, or a calendar is already added', async () => {
    const first = mount(<CalendarHomePrompt hasEvents={false} />)
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Add Trak to your calendar' })).toBeNull()
    first.unmount()
    link = { created_at: '2026-10-11T08:00:00Z', last_fetched_at: null }
    mount(<CalendarHomePrompt hasEvents />)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Add Trak to your calendar' })).toBeNull())
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Add Trak to your calendar' })).toBeNull()
  })

  it('"Not now" hides it on this device, and it stays hidden', async () => {
    const first = mount(<CalendarHomePrompt hasEvents />)
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Add Trak to your calendar' })).toBeNull()
    first.unmount()
    mount(<CalendarHomePrompt hasEvents />)
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Add Trak to your calendar' })).toBeNull()
    expect(created).toBe(0)
  })
})

describe('J8.10 a child login is never promised an email (Kostas, #286)', () => {
  it('Settings and the Home card say to check Trak for same-day changes', async () => {
    auth.user = CHILD_LOGIN
    const settings = mount(<CalendarSettings />)
    expect(await screen.findByText(/check Trak for same-day changes/i)).toBeInTheDocument()
    expect(screen.queryByText(/email you/i)).toBeNull()
    settings.unmount()
    mount(<CalendarHomePrompt hasEvents />)
    const card = await screen.findByRole('region', { name: 'Add Trak to your calendar' })
    expect(within(card).getByText(/check Trak for same-day changes/i)).toBeInTheDocument()
    expect(within(card).queryByText(/email you/i)).toBeNull()
  })
})
