import { forwardRef } from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'

/** TRAK-265 (Imad, 22 Oct): his pitch icon for the coach's Library. Drawn on a 128 grid, so a lucide stroke width
 *  (on a 24 grid) is scaled to match; the markings are fainter than the outline, as in his file. */
export const PitchIcon = forwardRef<SVGSVGElement, LucideProps>(function PitchIcon(
  { size = 24, strokeWidth = 2, color = 'currentColor', className, ...rest }, ref,
) {
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 128 128" fill="none" className={className} {...rest}>
      <g stroke={color} strokeWidth={Number(strokeWidth) * 128 / 24} strokeLinecap="round" strokeLinejoin="round">
        <g strokeOpacity={0.4}>
          <path d="M64 27v74" />
          <circle cx="64" cy="64" r="16" />
          <path d="M14 48h9a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-9M114 48h-9a6 6 0 0 0-6 6v20a6 6 0 0 0 6 6h9" />
        </g>
        <rect x="13" y="27" width="102" height="74" rx="12" />
      </g>
    </svg>
  )
}) as unknown as LucideIcon
