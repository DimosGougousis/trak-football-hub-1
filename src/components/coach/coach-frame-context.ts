import { createContext, useContext, useEffect, useRef } from 'react'

/** TRAK-259: what the coach's frame (CoachFrame) offers the page inside it. */
export interface CoachFrame {
  /** Opens the side menu as a sheet (phone and tablet: the coach's avatar). */
  openMenu: () => void
  /** The "+" saved something (a draft event); listeners refresh what they show. */
  subscribeSaved: (listener: () => void) => () => void
}

export const CoachFrameContext = createContext<CoachFrame | null>(null)

export const useCoachFrame = () => useContext(CoachFrameContext)

/** Calls `onSaved` whenever the frame's "+" saves something. Outside a frame it does nothing. */
export function useCreateSaved(onSaved: (() => void) | undefined) {
  const frame = useCoachFrame()
  const latest = useRef(onSaved)
  latest.current = onSaved
  useEffect(() => frame?.subscribeSaved(() => latest.current?.()), [frame])
}
