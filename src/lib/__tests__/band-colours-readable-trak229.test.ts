/**
 * TRAK-229 (Kostas, 22 Oct, option A): every band colour works on Trak's light
 * screens. Bars and dots (`color`) at least 3:1 on the screen and on a white
 * card; a band word in colour (`text`) at least 4.5:1 there and on its own pill
 * tint; Trak's ink on every pill tint well above 4.5:1. Greens above Steady,
 * clay below, each arm darker further from Steady.
 */
import { describe, expect, it } from 'vitest'
import { BANDS, BAND_TEXT } from '@/lib/types'

const SCREEN = '#FDFBF7', CARD = '#FFFFFF', INK = '#1A2421'
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('TRAK-229: band colours on light screens', () => {
  it.each(BANDS.map(b => [b.word, b] as const))('%s reads on light screens', (_word, band) => {
    expect(contrast(band.color, SCREEN)).toBeGreaterThanOrEqual(3)
    expect(contrast(band.color, CARD)).toBeGreaterThanOrEqual(3)
    expect(contrast(band.text, SCREEN)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(band.text, band.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(INK, band.bg)).toBeGreaterThanOrEqual(7)
  })

  it('each arm darkens away from Steady, so the order shows', () => {
    const L = (word: string) => lum(BANDS.find(b => b.word === word)!.color)
    expect(L('Good')).toBeGreaterThan(L('Standout'))
    expect(L('Standout')).toBeGreaterThan(L('Exceptional'))
    expect(L('Mixed')).toBeGreaterThan(L('Developing'))
    expect(L('Developing')).toBeGreaterThan(L('Difficult'))
  })

  it('names the readable shade for each band word', () => {
    expect(Object.keys(BAND_TEXT)).toEqual(BANDS.map(b => b.word))
    for (const band of BANDS) expect(BAND_TEXT[band.word as keyof typeof BAND_TEXT]).toBe(band.text)
  })
})
