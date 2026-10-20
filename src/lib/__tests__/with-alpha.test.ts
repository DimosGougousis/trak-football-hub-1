import { describe, expect, it } from 'vitest'
import { withAlpha } from '@/lib/with-alpha'

describe('TRAK-189 withAlpha', () => {
  it('puts a role token at an opacity', () => {
    expect(withAlpha('rgb(var(--t-brand))', 0.25)).toBe('rgb(var(--t-brand) / 0.25)')
  })
  it('still works for a hex code', () => {
    expect(withAlpha('#B5501A', 0.25)).toBe('#B5501A40')
    expect(withAlpha('#B5501A', 0.5)).toBe('#B5501A80')
  })
  it('leaves anything else alone, and nothing as nothing', () => {
    expect(withAlpha('currentColor', 0.5)).toBe('currentColor')
    expect(withAlpha(undefined, 0.5)).toBeUndefined()
  })
})
