import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { MobileShell } from '@/components/trak'
import { ParentLoadError } from '@/components/parent/ParentFamily'
import { fetchParentEvent } from '@/lib/parent-data'
import { rememberReturnTo } from '@/lib/return-to'

/**
 * TRAK-168 (J8.16): the address a WhatsApp share links to, /event/:id, the
 * same for everyone. A player goes to their event page; a parent to theirs,
 * with the child the event belongs to selected (a parent following Hugo
 * would otherwise miss Joshua's event); a coach to their schedule. Someone
 * signed out signs in first and comes back here.
 */
export default function EventLink() {
  const { id = '' } = useParams()
  const { user, profile, loading } = useAuth()
  const { children, selectChild, loading: childrenLoading } = useParentChildren()
  const [parentReady, setParentReady] = useState(false)
  const [lookupFailed, setLookupFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const isParent = profile?.role === 'parent'

  // Signed out: remember the event, so sign-in comes back to it.
  useEffect(() => {
    if (!loading && !user) rememberReturnTo(`/event/${id}`)
  }, [loading, user, id])

  useEffect(() => {
    // The linked children load after sign-in; choosing before they arrive
    // would pick none.
    if (!isParent || !id || childrenLoading) return
    const controller = new AbortController()
    // Ask each child's events (consent and squad rules included) which one
    // sees this event; the first that does is selected. None: the event page
    // says it isn't available. A failed lookup is not "none" (Imad, #292):
    // going on would open the event under the other child, so it stops here
    // with Retry unless another child already has the event.
    void (async () => {
      let failed = false
      for (const child of children) {
        try {
          const event = await fetchParentEvent(child.id, id, controller.signal)
          if (controller.signal.aborted) return
          if (event) { selectChild(child.id); setParentReady(true); return }
        } catch {
          if (controller.signal.aborted) return
          failed = true
        }
      }
      if (failed) setLookupFailed(true)
      else setParentReady(true)
    })()
    return () => { controller.abort() }
    // children is the parent's linked list; re-run only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, id, childrenLoading, attempt, children.map(c => c.id).join(',')])

  if (loading) return <div className="min-h-screen bg-[#0A0A0B]" />
  if (!user) return <Navigate to="/" replace />
  if (profile?.role === 'player') return <Navigate to={`/player/event/${id}`} replace />
  if (profile?.role === 'coach') return <Navigate to="/coach/schedule" replace />
  if (isParent && lookupFailed) {
    return <MobileShell><ParentLoadError message="Couldn't open this event."
      onRetry={() => { setLookupFailed(false); setAttempt(a => a + 1) }} /></MobileShell>
  }
  if (isParent) {
    return parentReady ? <Navigate to={`/parent/event/${id}`} replace /> : <div className="min-h-screen bg-[#0A0A0B]" />
  }
  return <Navigate to={profile?.role === 'club' ? '/club/home' : '/'} replace />
}
