/**
 * Tarek, 17 Oct (TRAK-189): the bands must keep their own colours so a player's
 * six bands tell apart at a glance. The colour pass had given Standout and Good
 * the same green in four places; every band colour now comes from BANDS.
 */
import { describe, expect, it } from 'vitest'
import { BANDS, BAND_COLOR } from '@/lib/types'
import { getRatingBand } from '@/lib/ratingBand'

describe('band colours', () => {
  it('every band has its own colour', () => {
    const colours = BANDS.map(b => b.color.toLowerCase())
    expect(new Set(colours).size).toBe(BANDS.length)
  })

  it('the 0–10 rating scale uses the same colour for each band', () => {
    expect(getRatingBand(9.5).color).toBe(BAND_COLOR.Exceptional)
    expect(getRatingBand(8.5).color).toBe(BAND_COLOR.Standout)
    expect(getRatingBand(7.5).color).toBe(BAND_COLOR.Good)
    expect(getRatingBand(6.5).color).toBe(BAND_COLOR.Steady)
    expect(getRatingBand(5.8).color).toBe(BAND_COLOR.Mixed)
    expect(getRatingBand(5.0).color).toBe(BAND_COLOR.Developing)
  })
})
