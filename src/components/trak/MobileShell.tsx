import { forwardRef, type ReactNode } from 'react'

/** Every role's page. `width` (TRAK-199) matters only for a coach on a tablet or
 *  laptop: 'read' keeps a page of text or a form narrower, so lines stay readable;
 *  'wide' gives a list or the calendar room for columns (TRAK-252). */
const COLUMN = { page: 'trak-page', read: 'trak-read', wide: 'trak-wide' } as const

export const MobileShell = forwardRef<HTMLDivElement, { children: ReactNode; width?: keyof typeof COLUMN }>(
  function MobileShell({ children, width = 'page' }, ref) {
    return (
      <div ref={ref} className={`mx-auto ${COLUMN[width]} min-h-screen bg-ground px-5 pb-24`}>
        {children}
      </div>
    )
  },
)
