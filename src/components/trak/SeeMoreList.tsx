import { useState, type ReactNode } from 'react'

/**
 * TRAK-170 (J8.7, live run 2): an upcoming list shows the next few, then
 * "See more", so matches and history below it stay within reach. `render`
 * must return a keyed element.
 */
export function SeeMoreList<T>({ items, first = 3, render }: { items: T[]; first?: number; render: (item: T) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const hidden = items.length - first
  return (
    <>
      {(open ? items : items.slice(0, first)).map(render)}
      {hidden > 0 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
          className="w-full py-2 text-[12px] text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
          style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {open ? 'Show fewer' : `See more (${hidden})`}
        </button>
      )}
    </>
  )
}
