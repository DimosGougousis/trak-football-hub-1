import { createContext, useContext, useEffect, useRef } from 'react'

/** TRAK-259: what the coach's frame (CoachFrame) offers the page inside it. */
export interface CoachFrame {
  /** Opens the side menu as a sheet (phone and tablet: the coach's avatar). */
  openMenu: () => void
  /** The "+" saved something (a draft event); listeners refresh what they show. */
  subscribeSaved: (listener: () => void) => () => void
}

/** TRAK-560: the room a phone's bottom sheet leaves under it, so it sits above the frame's floating tab bar: the bar's
 *  12 px lift, its 62 px height (Arc's glass tab bar) and the phone's home-indicator strip. 64 px was the old flat bar. */
export const ABOVE_TAB_BAR = 'calc(74px + env(safe-area-inset-bottom, 0px))'

export const CoachFrameContext = createContext<CoachFrame | null>(null)

export const useCoachFrame = () => useContext(CoachFrameContext)

/** Calls `onSaved` whenever the frame's "+" saves something. Outside a frame it does nothing. */
export function useCreateSaved(onSaved: (() => void) | undefined) {
  const frame = useCoachFrame()
  const latest = useRef(onSaved)
  latest.current = onSaved
  useEffect(() => frame?.subscribeSaved(() => latest.current?.()), [frame])
}
