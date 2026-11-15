/**
 * TRAK-199 (team decision, 21 Oct): only a signed-in coach's screens widen on a
 * tablet or a laptop. CoachLayout marks the page (html data-layout="coach")
 * while the signed-in profile is a coach. For a player, a parent or nobody the
 * mark is absent, so their screens keep the phone column on every device.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoachLayout } from '../CoachLayout'

const auth = vi.hoisted(() => ({ current: { profile: null as { role: string } | null } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth.current }))

const layout = () => document.documentElement.dataset.layout

afterEach(() => { cleanup(); delete document.documentElement.dataset.layout })

describe('CoachLayout', () => {
  it('marks the page for a signed-in coach', () => {
    auth.current = { profile: { role: 'coach' } }
    render(<CoachLayout />)
    expect(layout()).toBe('coach')
  })

  it.each(['player', 'parent', 'club'])('leaves a %s on the phone column', role => {
    auth.current = { profile: { role } }
    render(<CoachLayout />)
    expect(layout()).toBeUndefined()
  })

  it('drops the mark when the coach signs out', () => {
    auth.current = { profile: { role: 'coach' } }
    const view = render(<CoachLayout />)
    expect(layout()).toBe('coach')
    auth.current = { profile: null }
    view.rerender(<CoachLayout />)
    expect(layout()).toBeUndefined()
  })
})
