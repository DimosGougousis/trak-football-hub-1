import type { ReactNode } from 'react'

/** Imad's share icon (TRAK-168, 18 Oct): a box with an arrow out, drawn in the text colour. */
export function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 134) / 142} viewBox="0 0 142 134" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M71 69V21m-12 12 12-12 12 12" />
        <path d="M56 47h-3a14 14 0 0 0-13.7 11.1l-4 19A14 14 0 0 0 49 94h44a14 14 0 0 0 13.7-16.9l-4-19A14 14 0 0 0 89 47h-3" />
      </g>
    </svg>
  )
}

const canShareSheet = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/**
 * TRAK-168 (Imad, 18 Oct): Share opens the phone's share sheet with the message, so the
 * coach picks Viber or WhatsApp. Without one (a desktop browser) it's WhatsApp's link, as
 * before. Either way nothing is sent until the coach picks a chat. The message carries its
 * own event link, so only `text` is shared.
 */
export function ShareEventButton({ text, className, children, 'aria-label': label }: {
  text: string
  className?: string
  children?: ReactNode
  'aria-label'?: string
}) {
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
