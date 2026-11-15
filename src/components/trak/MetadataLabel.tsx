import { forwardRef, memo } from 'react'

export const MetadataLabel = memo(
  forwardRef<HTMLSpanElement, { text: string }>(function MetadataLabel({ text }, ref) {
    return (
      <span
        ref={ref}
        className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-3"
        style={{ fontFamily: 'var(--t-font-mono)' }}
      >
        {text}
      </span>
    )
  }),
)
