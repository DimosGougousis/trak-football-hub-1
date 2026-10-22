import { forwardRef, memo } from 'react'
import { BANDS, type BandType } from '@/lib/types'

export const BandPill = memo(
  forwardRef<HTMLSpanElement, { band: BandType }>(function BandPill({ band }, ref) {
    const config = BANDS.find(b => b.word.toLowerCase() === band) ?? BANDS[BANDS.length - 1]
    return (
      <span
        ref={ref}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full"
        style={{
          // TRAK-229: the band's light tint with a dot in its colour; the word in Trak's ink.
          color: 'rgb(var(--t-ink))',
          background: config.bg,
          border: `1px solid ${config.border}`,
          fontFamily: 'var(--t-font)',
          fontWeight: 400,
          letterSpacing: '-0.03em',
        }}
      >
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: config.color }} />
        {config.word}
      </span>
    )
  }),
)
