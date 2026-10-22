import { describe, expect, it } from 'vitest'
import { bornLine } from '../format'

describe('bornLine', () => {
  it('writes the date as Imad did and counts whole years', () => {
    expect(bornLine('2012-02-26', new Date(2026, 9, 22))).toBe('26/2/2012 · 14 years old')
  })
  it('turns a year older on the birthday, not the day after', () => {
    expect(bornLine('2012-10-22', new Date(2026, 9, 21))).toBe('22/10/2012 · 13 years old')
    expect(bornLine('2012-10-22', new Date(2026, 9, 22))).toBe('22/10/2012 · 14 years old')
  })
})
