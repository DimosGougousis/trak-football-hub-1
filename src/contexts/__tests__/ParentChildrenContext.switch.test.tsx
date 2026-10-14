import { useLayoutEffect, useRef } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParentChildrenProvider, useParentChildren } from '../ParentChildrenContext'

/**
 * A parent's switch to another child must stick, even when it lands in the
 * moment the parent's account has just loaded.
 *
 * CI (12 and 13 Oct, two unrelated branches): parent-retained-history switched
 * to Zara and the page kept showing Alex for over 4 s. The provider cleared the
 * selection in a passive effect when parentId appeared; React runs that effect
 * after the commit, so a switch made before it ran (here, Alex's cached alerts
 * were already on screen) was undone, and the selector snapped back.
 */

const PARENT = 'parent-1'
const CHILDREN = [{ id: 'alex', name: 'Alex' }, { id: 'zara', name: 'Zara' }]
const auth = vi.hoisted(() => ({ value: { user: null as { id: string } | null, profile: null as { role: string } | null } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth.value }))
vi.mock('@/lib/parent-data', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/parent-data')>()),
  fetchParentChildren: async () => CHILDREN,
}))

let client: QueryClient
beforeEach(() => {
  auth.value = { user: null, profile: null }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // The children are already cached from an earlier screen, as after
  // parent-retained-history's first mount.
  client.setQueryData(['parent', PARENT, 'children'], CHILDREN)
})
afterEach(cleanup)

// Switches to Zara in the same commit that first sees the parent's account,
// before any passive effect of that commit has run: the narrowest form of a
// tap that arrives as the page appears.
function SwitchAsSoonAsSignedIn() {
  const { parentId, selectedChild, selectChild } = useParentChildren()
  const done = useRef(false)
  useLayoutEffect(() => {
    if (parentId && !done.current) { done.current = true; selectChild('zara') }
  })
  return <p>following {selectedChild?.id ?? 'nobody'}</p>
}

function mount(ui: React.ReactNode) {
  return render(<QueryClientProvider client={client}><MemoryRouter>
    <ParentChildrenProvider>{ui}</ParentChildrenProvider>
  </MemoryRouter></QueryClientProvider>)
}

describe('ParentChildrenProvider: a child switch sticks', () => {
  it('keeps a switch made as the parent\'s account loads', async () => {
    const view = mount(<SwitchAsSoonAsSignedIn />)
    expect(screen.getByText('following nobody')).toBeInTheDocument()
    auth.value = { user: { id: PARENT }, profile: { role: 'parent' } }
    view.rerender(<QueryClientProvider client={client}><MemoryRouter>
      <ParentChildrenProvider><SwitchAsSoonAsSignedIn /></ParentChildrenProvider>
    </MemoryRouter></QueryClientProvider>)
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(screen.getByText('following zara')).toBeInTheDocument()
  })

  it('still never carries one parent\'s choice to another account', async () => {
    function Pick() {
      const { selectedChild, selectChild } = useParentChildren()
      return <><p>following {selectedChild?.id ?? 'nobody'}</p><button onClick={() => selectChild('zara')}>Zara</button></>
    }
    auth.value = { user: { id: PARENT }, profile: { role: 'parent' } }
    const tree = () => <QueryClientProvider client={client}><MemoryRouter><ParentChildrenProvider><Pick /></ParentChildrenProvider></MemoryRouter></QueryClientProvider>
    const view = render(tree())
    await act(async () => { screen.getByRole('button', { name: 'Zara' }).click() })
    expect(screen.getByText('following zara')).toBeInTheDocument()
    // Another parent signs in on the same device; their own linked children
    // happen to include the same ids.
    client.setQueryData(['parent', 'parent-2', 'children'], CHILDREN)
    auth.value = { user: { id: 'parent-2' }, profile: { role: 'parent' } }
    view.rerender(tree())
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(screen.getByText('following alex')).toBeInTheDocument()
  })
})
