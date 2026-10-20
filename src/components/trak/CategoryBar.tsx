import { BANDS } from '@/lib/types'
import { scoreToBand } from '@/lib/rating-engine'

interface CategoryBarProps {
  label: string
  score: number
}

export function CategoryBar({ label, score }: CategoryBarProps) {
  const band = scoreToBand(score)
  const config = BANDS.find(b => b.word.toLowerCase() === band)!
  const widthPercent = (score / 10) * 100

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-3" style={{ fontFamily: 'var(--t-font-mono)' }}>
          {label}
        </span>
        <span className="text-xs" style={{ color: config.color }}>
          {config.word}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-raised overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${widthPercent}%`, backgroundColor: config.color }}
        />
      </div>
    </div>
  )
}
