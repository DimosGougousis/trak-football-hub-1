import { RadarChart } from '@/components/arc/radar-chart/radar-chart'
import { LoadError } from '@/components/trak/LoadError'
import { BANDS, type BandType } from '@/lib/types'
import { ATTRIBUTES } from '@/lib/squad/attributes'
import type { squadShape } from '@/lib/squad/shape'

/**
 * TRAK-262 (Imad, 22 Oct, the alternative he picked): Home's Squad shape. The squad's six-attribute average this
 * month against last, out of 10, every axis "higher is better"; and how many players sit in each band, as chips.
 */
export function SquadShape({ squadLabel, shape, failed, onRetry }: {
  squadLabel: string
  /** null while loading. */
  shape: ReturnType<typeof squadShape> | null
  failed: boolean
  onRetry: () => void
}) {
  const series = shape ? [
    shape.thisMonth && { key: 'now', label: 'This month', values: shape.thisMonth },
    shape.lastMonth && { key: 'before', label: 'Last month', values: shape.lastMonth },
  ].filter(entry => !!entry) : []
  return <section className="arc rounded-2xl border border-line bg-surface p-5" aria-labelledby="squad-shape-title">
    <div className="grid gap-0.5">
      <h2 id="squad-shape-title" className="text-lg font-medium text-ink">Squad shape</h2>
      <p className="text-sm text-ink-3">{squadLabel} · this month against last</p>
    </div>
    {failed ? <div className="mt-4"><LoadError what="the squad's shape" onRetry={onRetry} /></div>
      : !shape ? <div role="status" aria-label="Loading the squad's shape" className="mt-4 h-[260px] rounded-xl bg-raised animate-pulse motion-reduce:animate-none" />
      : series.length === 0 ? <p className="mt-4 text-sm text-ink-2">No assessments this month or last. Assess a player and the squad's shape shows here.</p>
      : <>
        <RadarChart label="Squad average by attribute" size={260} rings={5} max={10}
          axes={ATTRIBUTES.map(([key, label]) => ({ key, label }))}
          series={series} formatValue={value => value.toFixed(1)} />
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Players per band">
          {BANDS.map(band => <li key={band.word} className="rounded-full border px-2.5 py-1 text-xs"
            style={{ background: band.bg, borderColor: band.border, color: band.text }}>
            {band.word} <span className="font-medium">{shape.bands[band.word.toLowerCase() as BandType] ?? 0}</span>
          </li>)}
        </ul>
      </>}
  </section>
}
