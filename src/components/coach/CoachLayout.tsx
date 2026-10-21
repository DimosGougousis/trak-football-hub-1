import { useLayoutEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/* TRAK-199 (team decision, 21 Oct): a coach's screens use a tablet's or a
   laptop's width; players and parents keep the phone column on every device.
   While a coach is signed in, html[data-layout="coach"] switches on the wider
   page widths and the laptop rail in src/index.css. On a phone nothing changes. */
export function CoachLayout() {
  const { profile } = useAuth()
  const coach = profile?.role === 'coach'

  // Before the browser paints, so a coach's first screen already opens at its width.
  useLayoutEffect(() => {
    const root = document.documentElement
    if (coach) root.dataset.layout = 'coach'
    else delete root.dataset.layout
  }, [coach])

  return null
}
