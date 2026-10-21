import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../tests/msw/server'
import { rpc } from '../../tests/msw/supabase'
import { CalendarSettings } from '@/components/trak/AddToCalendar'

/**
 * TRAK-228 (20 Oct live run): "Add to Google Calendar" replaced the Trak tab
 * with Google's page, so the family lost their place in Trak. Google's and
 * Outlook's prompts are web pages and open in a tab of their own. The tab is
 * opened during the tap: the personal link is made first, and a browser
 * blocks a tab opened after that wait.
 */

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'parent-228', email: 'p@example.test', app_metadata: {} }, profile: { role: 'parent' } }),
}))

let created: number
let createFails: boolean
let createdWhenTabOpened: number | null
type FakeTab = { location: { href: string }; opener: unknown; closed: boolean; close: () => void }
let tab: FakeTab | null

function fakeTab(): FakeTab {
  const t: FakeTab = { location: { href: 'about:blank' }, opener: window, closed: false, close: vi.fn(() => { t.closed = true }) }
  return t
}

beforeEach(() => {
  created = 0
  createFails = false
  createdWhenTabOpened = null
  tab = fakeTab()
  localStorage.clear()
  vi.spyOn(window, 'open').mockImplementation(() => { createdWhenTabOpened = created; return tab as unknown as Window })
  server.use(
    rpc('my_calendar_link', () => []),
    rpc('create_my_calendar_link', () => {
      if (createFails) return { status: 500, body: { message: 'Synthetic failure' } }
      created += 1
      return `token${created}${'x'.repeat(37)}`
    }),
  )
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><CalendarSettings /></MemoryRouter></QueryClientProvider>)
}

describe('TRAK-228: a web calendar opens beside Trak, not over it', () => {
  it('Google opens in its own tab, opened during the tap, then pointed at the subscribe page', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Google Calendar' }))
    expect(window.open).toHaveBeenCalledTimes(1)
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    // Before the link existed: still inside the tap.
    expect(createdWhenTabOpened).toBe(0)
    await waitFor(() => expect(tab!.location.href).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?cid=/))
    expect(decodeURIComponent(tab!.location.href)).toContain('/calendar-feed/token1')
    // The calendar's page can't reach back into Trak.
    expect(tab!.opener).toBeNull()
  })

  it('Outlook (work or school) opens the same way', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Google Calendar' }))
    await waitFor(() => expect(tab!.location.href).toContain('calendar.google.com'))
    tab = fakeTab()
    await userEvent.click(screen.getByRole('button', { name: 'Add to Outlook (work or school)' }))
    await waitFor(() => expect(tab!.location.href).toMatch(/^https:\/\/outlook\.office\.com\/calendar\/0\/addfromweb\?url=/))
    expect(created).toBe(1)
  })

  it('a blocked tab leaves a link to tap, never a dead end', async () => {
    tab = null
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Google Calendar' }))
    const open = await screen.findByRole('link', { name: 'Open Google Calendar' })
    expect(open.getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com\//)
    expect(open).toHaveAttribute('target', '_blank')
    expect(open.getAttribute('rel')).toContain('noopener')
  })

  it('when the link can\'t be made, the empty tab is closed and the error shows', async () => {
    createFails = true
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Google Calendar' }))
    await waitFor(() => expect(tab!.close).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
