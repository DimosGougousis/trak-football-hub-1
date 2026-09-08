import { forwardRef, memo } from 'react'

export const MetadataLabel = memo(
  forwardRef<HTMLSpanElement, { text: string }>(function MetadataLabel({ text }, ref) {
    return (
      <span
        ref={ref}
        className="text-[9px] font-medium tracking-[0.12em] uppercase text-[rgba(255,255,255,0.45)]"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {text}
      </span>
    )
  }),
)
