import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../tests/msw/server'
import { rpc } from '../../../tests/msw/supabase'
import EventLink from '../EventLink'
import LandingPage from '../LandingPage'
import { rememberReturnTo, takeReturnTo } from '@/lib/return-to'

/**
 * TRAK-168 (J8.16, live run 2): a WhatsApp share links to that event, not to
 * Home. One address for everyone: /event/:id sends a player to their event
 * page, a parent to it with the right child selected (the one the event is
 * for), a coach to their schedule, and someone signed out to sign in first.
 */

const EVENT = '5be00484-226f-4a70-9603-cec67c5ea91a'
const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  role: 'player' as string,
  children: [] as { id: string; name: string }[],
  selected: [] as string[],
  childrenLoading: false,
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user, profile: state.user ? { role: state.role } : null, loading: false }),
}))
vi.mock('@/contexts/ParentChildrenContext', () => ({
  useParentChildren: () => ({
    parentId: state.user?.id ?? null, children: state.children, selectedChild: state.children[0] ?? null,
    selectChild: (id: string) => { state.selected.push(id) }, loading: state.childrenLoading, error: false, retry: () => {},
  }),
}))

const Where = ({ label }: { label: string }) => <p>{label} {useParams().id ?? ''}</p>
function open() {
  return render(<MemoryRouter initialEntries={[`/event/${EVENT}`]}>
    <Routes>
      <Route path="/event/:id" element={<EventLink />} />
      <Route path="/" element={<Where label="Sign in" />} />
      <Route path="/player/event/:id" element={<Where label="Player event" />} />
      <Route path="/parent/event/:id" element={<Where label="Parent event" />} />
      <Route path="/coach/schedule" element={<Where label="Coach schedule" />} />
      <Route path="/club/home" element={<Where label="Club home" />} />
    </Routes>
  </MemoryRouter>)
}

beforeEach(() => {
  state.user = { id: 'u-1' }
  state.role = 'player'
  state.children = []
  state.selected = []
  state.childrenLoading = false
  sessionStorage.clear()
})
afterEach(cleanup)

describe('TRAK-168 /event/:id opens that event for whoever signs in', () => {
  it('a player lands on their event page', async () => {
    open()
    expect(await screen.findByText(`Player event ${EVENT}`)).toBeInTheDocument()
  })

  it('a parent of two lands on the event with the child it belongs to selected', async () => {
    state.role = 'parent'
    state.children = [{ id: 'hugo', name: 'Hugo' }, { id: 'joshua', name: 'Joshua' }]
    server.use(rpc('child_events', args => (args.p_child === 'joshua' ? [{ id: EVENT }] : [])))
    open()
    expect(await screen.findByText(`Parent event ${EVENT}`)).toBeInTheDocument()
    expect(state.selected).toEqual(['joshua'])
  })

  it('a parent whose children can\'t see it still lands on the event page, which says so', async () => {
    state.role = 'parent'
    state.children = [{ id: 'hugo', name: 'Hugo' }]
    server.use(rpc('child_events', () => []))
    open()
    expect(await screen.findByText(`Parent event ${EVENT}`)).toBeInTheDocument()
    expect(state.selected).toEqual([])
  })

  it('waits for the parent\'s children to load before choosing one', async () => {
    state.role = 'parent'
    state.childrenLoading = true
    server.use(rpc('child_events', args => (args.p_child === 'joshua' ? [{ id: EVENT }] : [])))
    const view = open()
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByText(`Parent event ${EVENT}`)).toBeNull()
    state.childrenLoading = false
    state.children = [{ id: 'hugo', name: 'Hugo' }, { id: 'joshua', name: 'Joshua' }]
    view.rerender(<MemoryRouter initialEntries={[`/event/${EVENT}`]}><Routes><Route path="/event/:id" element={<EventLink />} /><Route path="/parent/event/:id" element={<Where label="Parent event" />} /></Routes></MemoryRouter>)
    expect(await screen.findByText(`Parent event ${EVENT}`)).toBeInTheDocument()
    expect(state.selected).toEqual(['joshua'])
  })

  it('a coach lands on their schedule', async () => {
    state.role = 'coach'
    open()
    expect(await screen.findByText('Coach schedule')).toBeInTheDocument()
  })

  it('someone signed out signs in first, and the event is remembered for after', async () => {
    state.user = null
    open()
    expect(await screen.findByText('Sign in')).toBeInTheDocument()
    expect(takeReturnTo()).toBe(`/event/${EVENT}`)
    expect(takeReturnTo()).toBeNull()
  })
})

describe('return-to: only an event link is ever remembered', () => {
  it('refuses anything that isn\'t /event/<id>, so it can\'t send people elsewhere', () => {
    for (const path of ['https://evil.example/x', '//evil.example', '/parent/home', '/event/not-an-id', `/event/${EVENT}/../admin`]) {
      rememberReturnTo(path)
      expect(takeReturnTo()).toBeNull()
    }
    rememberReturnTo(`/event/${EVENT}`)
    expect(takeReturnTo()).toBe(`/event/${EVENT}`)
  })
})

describe('TRAK-168 after signing in, a remembered event link wins over Home', () => {
  const land = () => render(<MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/event/:id" element={<Where label="Event link" />} />
      <Route path="/parent/home" element={<Where label="Parent home" />} />
    </Routes>
  </MemoryRouter>)

  it('goes to the shared event', async () => {
    state.role = 'parent'
    rememberReturnTo(`/event/${EVENT}`)
    land()
    expect(await screen.findByText(`Event link ${EVENT}`)).toBeInTheDocument()
  })

  it('goes Home when nothing was shared', async () => {
    state.role = 'parent'
    land()
    expect(await screen.findByText('Parent home')).toBeInTheDocument()
  })
})
