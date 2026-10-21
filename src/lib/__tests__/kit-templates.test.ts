import { describe, expect, it } from 'vitest'
import { KIT_COLLECTIONS, KIT_SLOTS, copyKitSet, describeKit, kitDesignSchema, teamKitSetSchema } from '../kit-templates'

describe('reusable kit templates', () => {
  it('round-trips every complete collection as versioned JSON without sharing edited objects', () => {
    for (const { kits } of KIT_COLLECTIONS) {
      expect(teamKitSetSchema.parse(JSON.parse(JSON.stringify(kits)))).toEqual(kits)
      const edited = copyKitSet(kits)
      edited.home.shirt = '#123456'
      expect(kits.home.shirt).not.toBe('#123456')
      expect(edited.away).toEqual(kits.away)
      expect(edited.alternate).toEqual(kits.alternate)
      expect(new Set(KIT_SLOTS.map(slot => JSON.stringify(kits[slot]))).size).toBe(3)
    }
  })

  it('refuses missing slots, unsupported versions, unknown patterns, and non-color SVG inputs', () => {
    const kits = copyKitSet(KIT_COLLECTIONS[0].kits)
    expect(teamKitSetSchema.safeParse({ ...kits, away: undefined }).success).toBe(false)
    expect(teamKitSetSchema.safeParse({ ...kits, version: 2 }).success).toBe(false)
    expect(kitDesignSchema.safeParse({ ...kits.home, pattern: 'unknown' }).success).toBe(false)
    for (const color of ['red', '#123', 'url(https://example.com/paint.svg)', '<script>']) {
      expect(kitDesignSchema.safeParse({ ...kits.home, shirt: color }).success).toBe(false)
    }
  })

  it('describes the entire kit without making families rely on color alone', () => {
    expect(describeKit(KIT_COLLECTIONS[0].kits.home)).toBe('Burgundy shirt, gold trim, white shorts, burgundy socks')
    expect(describeKit({ ...KIT_COLLECTIONS[0].kits.home, pattern: 'stripes', shirt: '#123456' })).toContain('#123456 shirt with white stripes')
  })
})
