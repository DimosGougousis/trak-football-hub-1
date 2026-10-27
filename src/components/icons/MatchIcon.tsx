import { forwardRef } from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'

/** TRAK-283: IconMatch's ball as a nav icon for Games, in the nav's own colour, as PitchIcon is for Library. Drawn
 *  on a 22 grid, so a lucide stroke width (on a 24 grid) is scaled to match; the ticks are thinner, as in IconMatch. */
export const MatchIcon = forwardRef<SVGSVGElement, LucideProps>(function MatchIcon(
  { size = 24, strokeWidth = 2, color = 'currentColor', className, ...rest }, ref,
) {
  const stroke = Number(strokeWidth) * 22 / 24
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 22 22" fill="none" className={className} {...rest}>
      <g stroke={color} strokeLinecap="round">
        <circle cx="11" cy="11" r="9" strokeWidth={stroke} />
        <path d="M7 11C7.5 8.5 9.5 7 11 7C12.5 7 14.5 8.5 15 11M8 13.5C8.5 15.5 9.8 16.5 11 16.5C12.2 16.5 13.5 15.5 14 13.5" strokeWidth={stroke} />
        <path d="M11 7V4M7.5 8.5L5.5 6.5M14.5 8.5L16.5 6.5" strokeWidth={stroke * 2 / 3} />
      </g>
    </svg>
  )
}) as unknown as LucideIcon
