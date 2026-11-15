import { forwardRef, type ReactNode } from 'react'

/** TRAK-307 (Kostas, 29 Oct): ONE column for every page in a coach's menu (Home, Schedule, Squad, Games, Training,
 *  Settings, Library), Squad's and Games': on a tablet or a laptop the page fills the screen beside the menu, 32 px
 *  from each side, up to 1,280 px (--wide-w in src/index.css); a phone keeps the phone column. A menu page that
 *  isn't a MobileShell takes these classes itself. */
export const WIDE_COLUMN = 'mx-auto w-full trak-wide px-5 tablet:px-8'

/** Every role's page. `width` (TRAK-199) matters only for a coach on a tablet or
 *  laptop: 'read' keeps a page of text or a form narrower, so lines stay readable;
 *  'wide' is every page in the coach's menu, and lists (TRAK-252, TRAK-307). */
const COLUMN = { page: 'mx-auto trak-page px-5', read: 'mx-auto trak-read px-5', wide: WIDE_COLUMN } as const

export const MobileShell = forwardRef<HTMLDivElement, { children: ReactNode; width?: keyof typeof COLUMN }>(
  function MobileShell({ children, width = 'page' }, ref) {
    return (
      <div ref={ref} className={`${COLUMN[width]} min-h-screen bg-ground pb-24`}>
        {children}
      </div>
    )
  },
)
