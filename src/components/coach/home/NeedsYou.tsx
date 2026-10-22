import { ArrowRight } from 'lucide-react'
import { Avatar } from '@/components/arc/avatar/avatar'
import { ScrollArea } from '@/components/arc/scroll-area/scroll-area'
import { LoadError } from '@/components/trak/LoadError'
import type { NeedsYouItem } from '@/lib/coach-needs-you'

/** TRAK-262 (Imad, 22 Oct): Home's Needs you, one swipeable card per player (`needsYou()` says who). */
export function NeedsYou({ items, failed, onRetry, onOpen }: {
  /** null while loading. */
  items: NeedsYouItem[] | null
  failed: boolean
  onRetry: () => void
  onOpen: (item: NeedsYouItem) => void
}) {
  return <section aria-labelledby="needs-you-title">
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 id="needs-you-title" className="text-lg font-medium text-ink">Needs you {items && <span className="text-ink-3 font-normal">{items.length}</span>}</h2>
      {items && items.length > 1 && <span className="text-sm text-ink-3"><span className="[@media(pointer:fine)]:hidden">Swipe</span><span className="[@media(pointer:coarse)]:hidden">Scroll</span> for more</span>}
    </div>
    {failed ? <LoadError what="who needs you" onRetry={onRetry} />
      : !items ? <div role="status" aria-label="Loading who needs you" className="h-[148px] rounded-2xl border border-line bg-surface animate-pulse motion-reduce:animate-none" />
      : items.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">Every player is assessed and no draft is waiting.</p>
      : <div className="arc -mx-1">
        <ScrollArea orientation="horizontal" snap="x mandatory" fade={24} label="Players who need you">
          <ul className="flex gap-3 px-1 pb-1">
            {items.map(item => <li key={`${item.kind}:${item.playerId}`} className="w-[248px] flex-none" style={{ scrollSnapAlign: 'start' }}>
              <button type="button" onClick={() => onOpen(item)}
                className="flex h-full w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-transform active:scale-[.98] motion-reduce:transition-none">
                <span className="flex items-center gap-3">
                  <Avatar name={item.name} size="md" />
                  <span className="grid min-w-0">
                    <span className="truncate text-base font-medium text-ink">{item.name}</span>
                    {item.detail && <span className="truncate text-sm text-ink-3">{item.detail}</span>}
                  </span>
                </span>
                <span className="flex items-start gap-2 text-sm text-ink-2">
                  <span className={`mt-1.5 size-2 flex-none rounded-full ${item.urgent ? 'bg-danger' : item.kind === 'draft' ? 'bg-info' : 'bg-warning'}`} aria-hidden />
                  <span>{item.urgent && <span className="sr-only">Urgent: </span>}{item.reason}</span>
                </span>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                  {item.kind === 'draft' ? 'Finish draft' : 'Assess'} <ArrowRight size={16} aria-hidden />
                </span>
              </button>
            </li>)}
          </ul>
        </ScrollArea>
      </div>}
  </section>
}
