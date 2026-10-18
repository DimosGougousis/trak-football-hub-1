import { useState, type ReactNode } from 'react'

/**
 * TRAK-170 (J8.7, live run 2): an upcoming list shows the next few, then
 * "See more", so matches and history below it stay within reach. TRAK-195
 * (Kostas, 16 Oct): each "See more" adds the next `step`, not the whole season;
 * once everything shows, "Show fewer" folds it back. `render` must return a
 * keyed element.
 */
export function SeeMoreList<T>({ items, first = 3, step = 5, render }: {
  items: T[]; first?: number; step?: number; render: (item: T) => ReactNode
}) {
  const [shown, setShown] = useState(first)
  const visible = items.slice(0, shown)
  const hidden = items.length - visible.length
  const button = 'w-full py-2 text-[12px] text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg'
  return (
    <>
      {visible.map(render)}
      {hidden > 0 ? (
        <button type="button" aria-expanded={false} onClick={() => setShown(n => n + step)} className={button}
          style={{ fontFamily: "'DM Sans', sans-serif" }}>
          See more ({hidden})
        </button>
      ) : items.length > first && (
        <button type="button" aria-expanded onClick={() => setShown(first)} className={button}
          style={{ fontFamily: "'DM Sans', sans-serif" }}>
          Show fewer
        </button>
      )}
    </>
  )
}
