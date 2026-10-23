/**
 * TRAK-225 (20 Oct live run, S4): a coach may paste a Google Maps link into an
 * event's venue, alone or after the venue's name. "Open in Maps" opens that
 * link itself, and the venue line shows the name without it. Any other venue
 * opens a Maps search for its words. Only https links on a known Maps host are
 * ever opened; anything else (another website, http:, javascript:) is text.
 * Event emails still replace every coach-typed link (TRAK-135); this is the app.
 */

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi

/** The Maps hosts a pasted place link comes from. A path is needed for the shared hosts. */
function isMapsLink(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'maps.app.goo.gl' || host === 'maps.apple.com') return true
  if (host === 'goo.gl') return url.pathname.startsWith('/maps')
  if (/^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return true
  return /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) && url.pathname.startsWith('/maps')
}

/** The first Maps place link in some text, as it was typed; null when there is none. */
function findMapsLink(text: string): string | null {
  for (const match of text.match(URL_IN_TEXT) ?? []) {
    const raw = match.replace(/[),.;]+$/, '')
    try {
      if (isMapsLink(new URL(raw))) return raw
    } catch { /* not a URL after all: it stays text */ }
  }
  return null
}

/**
 * TRAK-255: the coach's form keeps a venue's name and its map link in two
 * boxes. A venue is still stored as one line, the name then the link
 * (TRAK-225), so families, emails and the calendar feed read it as before.
 * One space separates them; any other spacing in the name is kept as typed.
 */
export function splitVenue(venue: string): { name: string; link: string } {
  const link = findMapsLink(venue)
  if (!link) return { name: venue, link: '' }
  const at = venue.indexOf(link)
  const before = venue.slice(0, at).replace(/ $/, '')
  const after = venue.slice(at + link.length).trim()
  return { name: after ? `${before.trimEnd()} ${after}` : before, link }
}

export function joinVenue(name: string, link: string): string {
  const url = link.trim()
  if (!url) return name
  return name.trim() ? `${name} ${url}` : url
}

/** A pasted or typed Google or Apple Maps place link. */
export const isMapsUrl = (text: string) => findMapsLink(text.trim()) === text.trim() && text.trim() !== ''

const mapsSearch = (words: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(words)}`

/** The venue's words to show, and the link "Open in Maps" opens. */
export function venueParts(venue: string): { text: string; mapsUrl: string } {
  let mapsUrl: string | null = null
  for (const match of venue.match(URL_IN_TEXT) ?? []) {
    const raw = match.replace(/[),.;]+$/, '')
    try {
      if (!mapsUrl && isMapsLink(new URL(raw))) mapsUrl = raw
    } catch { /* not a URL after all: it stays text */ }
  }
  // Show the name without the Maps link and the separator left before it.
  const text = (mapsUrl ? venue.replace(mapsUrl, '') : venue).replace(/[\s,;–-]+$/, '').replace(/^[\s,;–-]+/, '').trim()
  // A search uses words only, never a link's text.
  const words = text.replace(URL_IN_TEXT, '').replace(/\s+/g, ' ').trim()
  return { text, mapsUrl: mapsUrl ?? mapsSearch(words || text) }
}
