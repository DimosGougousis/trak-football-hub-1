import { describe, it, expect } from 'vitest'
import { isMapsUrl, joinVenue, splitVenue, venueParts } from '@/lib/venue-link'

/**
 * TRAK-255: the form keeps a venue's name and map link in two boxes; the
 * venue is stored as one line as before (TRAK-225), so what families read
 * through venueParts() is unchanged.
 */
describe('TRAK-255: a venue\'s name and map link', () => {
  it('splits a stored venue into its name and its Maps link', () => {
    expect(splitVenue('Municipal Stadium https://maps.app.goo.gl/abc123')).toEqual({ name: 'Municipal Stadium', link: 'https://maps.app.goo.gl/abc123' })
    expect(splitVenue('https://maps.app.goo.gl/abc123')).toEqual({ name: '', link: 'https://maps.app.goo.gl/abc123' })
    expect(splitVenue('Main pitch')).toEqual({ name: 'Main pitch', link: '' })
    // Another website is not a map link: it stays part of the name, as venueParts() treats it.
    expect(splitVenue('Pitch https://example.com/x')).toEqual({ name: 'Pitch https://example.com/x', link: '' })
  })

  it('joins them back as one line, keeping the name as typed', () => {
    expect(joinVenue('Municipal Stadium', 'https://maps.app.goo.gl/abc123')).toBe('Municipal Stadium https://maps.app.goo.gl/abc123')
    expect(joinVenue('Main pitch', '')).toBe('Main pitch')
    expect(joinVenue('', 'https://maps.app.goo.gl/abc123')).toBe('https://maps.app.goo.gl/abc123')
    // A space being typed at the end of the name survives the round trip.
    expect(splitVenue(joinVenue('Municipal ', 'https://maps.app.goo.gl/abc123')).name).toBe('Municipal ')
  })

  it('reads the same for families as before', () => {
    const stored = joinVenue('Municipal Stadium', 'https://maps.app.goo.gl/abc123')
    expect(venueParts(stored)).toEqual({ text: 'Municipal Stadium', mapsUrl: 'https://maps.app.goo.gl/abc123' })
  })

  it('knows a Maps link when one is pasted', () => {
    expect(isMapsUrl('https://maps.app.goo.gl/new777')).toBe(true)
    expect(isMapsUrl(' https://www.google.com/maps/place/Rizoupoli ')).toBe(true)
    expect(isMapsUrl('Rizoupoli')).toBe(false)
    expect(isMapsUrl('https://example.com/maps')).toBe(false)
    expect(isMapsUrl('')).toBe(false)
  })
})
