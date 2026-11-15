/** TRAK-168: the phone's share sheet (Viber or WhatsApp), where the browser has one. */
export const canShareSheet = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/** The same share as ShareEventButton, for a button that isn't one (TRAK-272's button group): the phone's
 *  share sheet, else WhatsApp's link in a new tab, so Trak stays open. Nothing is sent until a chat is picked. */
export function shareEventText(text: string) {
  if (canShareSheet()) { navigator.share({ text }).catch(() => {}); return }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}
