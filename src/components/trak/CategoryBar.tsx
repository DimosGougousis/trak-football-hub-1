import { BANDS } from '@/lib/types'
import { scoreColor, scoreShade, scoreToBand } from '@/lib/rating-engine'

interface CategoryBarProps {
  label: string
  /** TRAK-501: none yet draws the empty bar, with no band word. */
  score?: number
}

export function CategoryBar({ label, score }: CategoryBarProps) {
  const config = score == null ? null : BANDS.find(b => b.word.toLowerCase() === scoreToBand(score))!

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center min-h-4">
        <span className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-3" style={{ fontFamily: 'var(--t-font-mono)' }}>
          {label}
        </span>
        {config && <span className="text-xs" style={{ color: scoreShade(score!) }}>
          {config.word}
        </span>}
      </div>
      <div className="h-1.5 rounded-full bg-raised overflow-hidden">
        {config && score != null && <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(score / 10) * 100}%`, backgroundColor: scoreColor(score) }}
        />}
      </div>
    </div>
  )
}
