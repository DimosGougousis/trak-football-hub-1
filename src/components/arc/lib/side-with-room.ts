/**
 * TRAK-227 (20 Oct live run): opened from a field low on a phone, a date
 * calendar or a time list dropped down past the end of the event sheet's
 * scroll area: cut off, over Next, and the coach had to scroll to reach it.
 *
 * Room is measured to the edges of what can be seen: the visible screen (which
 * the keyboard shrinks) and every scroll area the field sits in. A panel opens
 * below when there's `room` there, else on whichever side has more.
 */
function visibleBounds(field: HTMLElement): { top: number; bottom: number } {
  const visible = window.visualViewport
  let top = visible?.offsetTop ?? 0
  let bottom = top + (visible?.height ?? window.innerHeight)
  for (let node = field.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'hidden') continue
    const rect = node.getBoundingClientRect()
    top = Math.max(top, rect.top)
    bottom = Math.min(bottom, rect.bottom)
  }
  return { top, bottom }
}

export function sideWithRoom(field: HTMLElement | null, room: number): 'top' | 'bottom' {
  if (!field || typeof window === 'undefined') return 'bottom'
  const rect = field.getBoundingClientRect()
  const bounds = visibleBounds(field)
  const below = bounds.bottom - rect.bottom, above = rect.top - bounds.top
  return below >= room || below >= above ? 'bottom' : 'top'
}

/** Once a panel has finished opening: scroll it fully into view inside its scroll area, so nobody has to. */
export function revealPanel(panel: HTMLElement | null) {
  panel?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}
