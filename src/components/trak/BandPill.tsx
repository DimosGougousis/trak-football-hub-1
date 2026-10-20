import { forwardRef, memo } from 'react'
import { BANDS, type BandType } from '@/lib/types'

export const BandPill = memo(
  forwardRef<HTMLSpanElement, { band: BandType }>(function BandPill({ band }, ref) {
    const config = BANDS.find(b => b.word.toLowerCase() === band) ?? BANDS[BANDS.length - 1]
    return (
      <span
        ref={ref}
        className="trak-dark inline-flex items-center px-3 py-1 text-xs font-medium rounded-full"
        style={{
          color: config.color,
          // Tarek, 17 Oct: the band colours read on a dark pill, as on the dark app.
          background: `linear-gradient(${config.bg}, ${config.bg}), rgb(var(--t-surface))`,
          border: `1px solid ${config.border}`,
          fontFamily: 'var(--t-font)',
          fontWeight: 400,
          letterSpacing: '-0.03em',
        }}
      >
        {config.word}
      </span>
    )
  }),
)
