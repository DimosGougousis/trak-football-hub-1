import { createContext, useContext, useEffect } from 'react'

/* TRAK-554 (Kostas, 23 Nov): the coach's "Published" is a state, not a button, so the event sheet shows it at its top
   right under the date. The coach's part of the sheet (EventSheetCoach) knows the event's state first, fresh after
   Publish, and says it here. */
export type SheetState = 'published' | null

export const SheetStateContext = createContext<(state: SheetState) => void>(() => {})

/** Shows "Published" at the sheet's top right while `state` is 'published'; nothing once it isn't or the part closes. */
export function useSheetState(state: SheetState) {
  const set = useContext(SheetStateContext)
  useEffect(() => { set(state); return () => set(null) }, [set, state])
}
