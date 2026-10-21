import { describe, expect, it } from 'vitest'
import { venueParts } from '../venue-link'

/**
 * TRAK-225 (20 Oct live run, S4): a coach pasted a Google Maps link into an
 * event's venue. The event showed the link as plain text, and "Open in Maps"
 * searched Google for the link's own text instead of opening the place.
 */

const search = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

describe('TRAK-225: a venue with a Maps link opens that place', () => {
  it('a plain venue still opens a search for it', () => {
    expect(venueParts('Rivals Park')).toEqual({ text: 'Rivals Park', mapsUrl: search('Rivals Park') })
  })

  it('a pasted Google Maps short link opens as it is, and isn\'t shown as text', () => {
    expect(venueParts('https://maps.app.goo.gl/AbC123xyz')).toEqual({ text: '', mapsUrl: 'https://maps.app.goo.gl/AbC123xyz' })
  })

  it('a name and a full Google Maps link: the name shows, the link opens', () => {
    const url = 'https://www.google.com/maps/place/Rivals+Park/@37.94,23.70,17z'
    expect(venueParts(`Rivals Park, ${url}`)).toEqual({ text: 'Rivals Park', mapsUrl: url })
    expect(venueParts(`Rivals Park ${'https://goo.gl/maps/q1w2e3'}`)).toEqual({ text: 'Rivals Park', mapsUrl: 'https://goo.gl/maps/q1w2e3' })
  })

  it('Apple Maps and maps.google.com links are kept too', () => {
    expect(venueParts('https://maps.apple.com/?q=Rivals+Park').mapsUrl).toBe('https://maps.apple.com/?q=Rivals+Park')
    expect(venueParts('https://maps.google.com/?q=37.94,23.70').mapsUrl).toBe('https://maps.google.com/?q=37.94,23.70')
  })

  it('another website is not a map: the search uses the words, never the link', () => {
    const parts = venueParts('Academy pitch https://club.example/directions')
    expect(parts.mapsUrl).toBe(search('Academy pitch'))
  })

  it('never links anything but https: a javascript: or http: link is only text', () => {
    expect(venueParts('javascript:alert(1)').mapsUrl.startsWith('https://www.google.com/maps/search/')).toBe(true)
    expect(venueParts('http://maps.google.com/?q=x').mapsUrl.startsWith('https://www.google.com/maps/search/')).toBe(true)
  })

  it('a Maps look-alike on another domain is not trusted', () => {
    expect(venueParts('https://maps.google.com.evil.example/x').mapsUrl.startsWith('https://www.google.com/maps/search/')).toBe(true)
    expect(venueParts('https://evil.example/maps/place/x').mapsUrl.startsWith('https://www.google.com/maps/search/')).toBe(true)
  })
})
