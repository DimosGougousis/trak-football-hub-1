import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { supabase } from '@/integrations/supabase/client'
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
  const isParent = profile?.role === 'parent'

  // Signed out: remember the event, so sign-in comes back to it.
  useEffect(() => {
    if (!loading && !user) rememberReturnTo(`/event/${id}`)
  }, [loading, user, id])

  useEffect(() => {
    // The linked children load after sign-in; choosing before they arrive
    // would pick none.
    if (!isParent || !id || childrenLoading) return
    let cancelled = false
    // Ask each child's events (consent and squad rules included) which one
    // sees this event; the first that does is selected. None: the event page
    // says it isn't available.
    void (async () => {
      for (const child of children) {
        const { data } = await supabase.rpc('child_events', { p_child: child.id }).eq('id', id)
        if (cancelled) return
        if ((data ?? []).length > 0) { selectChild(child.id); break }
      }
      if (!cancelled) setParentReady(true)
    })()
    return () => { cancelled = true }
    // children is the parent's linked list; re-run only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, id, childrenLoading, children.map(c => c.id).join(',')])

  if (loading) return <div className="min-h-screen bg-[#0A0A0B]" />
  if (!user) return <Navigate to="/" replace />
  if (profile?.role === 'player') return <Navigate to={`/player/event/${id}`} replace />
  if (profile?.role === 'coach') return <Navigate to="/coach/schedule" replace />
  if (isParent) {
    return parentReady ? <Navigate to={`/parent/event/${id}`} replace /> : <div className="min-h-screen bg-[#0A0A0B]" />
  }
  return <Navigate to={profile?.role === 'club' ? '/club/home' : '/'} replace />
}
