import type { ReactNode } from 'react'
import { canShareSheet } from '@/lib/share-event'
import { Button } from '@/components/arc/button/button'
import { NEXT_STEP_SIZE, NEXT_STEP_WIDTH } from '@/components/coach/next-step'

/** Imad's share icon (TRAK-168, 18 Oct): a box with an arrow out, drawn in the text colour. */
/** `tight` crops the drawing's margin, so it is as big as a lucide icon beside it (TRAK-275's button group). */
export function ShareIcon({ size = 16, tight = false }: { size?: number; tight?: boolean }) {
  return (
    <svg width={size} height={tight ? size : (size * 134) / 142} viewBox={tight ? '32 17 78 80' : '0 0 142 134'} fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M71 69V21m-12 12 12-12 12 12" />
        <path d="M56 47h-3a14 14 0 0 0-13.7 11.1l-4 19A14 14 0 0 0 49 94h44a14 14 0 0 0 13.7-16.9l-4-19A14 14 0 0 0 89 47h-3" />
      </g>
    </svg>
  )
}

/**
 * TRAK-168 (Imad, 18 Oct): Share opens the phone's share sheet with the message, so the
 * coach picks Viber or WhatsApp. Without one (a desktop browser) it's WhatsApp's link, as
 * before. Either way nothing is sent until the coach picks a chat. The message carries its
 * own event link, so only `text` is shared.
 */
export function ShareEventButton({ text, className, children, arc, 'aria-label': label }: {
  text: string
  className?: string
  children?: ReactNode
  /** TRAK-427: Arc's secondary button, as the pop-up's other actions. Without a share sheet it opens WhatsApp's link in
   *  a new tab on click, so it is a button, not a link. */
  arc?: boolean | 'next-step'
  'aria-label'?: string
}) {
  if (arc) {
    // TRAK-497: as a next step (Home's week), the green primary every next step is; elsewhere the secondary.
    const step = arc === 'next-step'
    return (
      <Button variant={step ? 'primary' : 'secondary'} size={step ? NEXT_STEP_SIZE : undefined} className={step ? NEXT_STEP_WIDTH : undefined} aria-label={label}
        onClick={() => {
          if (canShareSheet()) navigator.share({ text }).catch(() => {})
          else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
        }}>
        {children}
      </Button>
    )
  }
  if (canShareSheet()) {
    return (
      <button type="button" aria-label={label} className={className}
        onClick={() => {
          // Closing the sheet without a chat rejects with AbortError; that's the coach's choice.
          navigator.share({ text }).catch(() => {})
        }}>
        {children}
      </button>
    )
  }
  return (
    <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
      aria-label={label} className={className}>
      {children}
    </a>
  )
}
