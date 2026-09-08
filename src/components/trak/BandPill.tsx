import { forwardRef, memo } from 'react'
import { BANDS, type BandType } from '@/lib/types'

export const BandPill = memo(
  forwardRef<HTMLSpanElement, { band: BandType }>(function BandPill({ band }, ref) {
    const config = BANDS.find(b => b.word.toLowerCase() === band) ?? BANDS[BANDS.length - 1]
    return (
      <span
        ref={ref}
        className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full"
        style={{
          color: config.color,
          background: config.bg,
          border: `1px solid ${config.border}`,
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 400,
          letterSpacing: '-0.03em',
        }}
      >
        {config.word}
      </span>
    )
  }),
)
