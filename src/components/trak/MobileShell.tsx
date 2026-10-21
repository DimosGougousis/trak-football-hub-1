import { forwardRef, type ReactNode } from 'react'

/** Every role's page. `width` (TRAK-199) matters only for a coach on a tablet or
 *  laptop: 'read' keeps a page of text or a form narrower, so lines stay readable. */
export const MobileShell = forwardRef<HTMLDivElement, { children: ReactNode; width?: 'page' | 'read' }>(
  function MobileShell({ children, width = 'page' }, ref) {
    return (
      <div ref={ref} className={`mx-auto ${width === 'read' ? 'trak-read' : 'trak-page'} min-h-screen bg-ground px-5 pb-24`}>
        {children}
      </div>
    )
  },
)
