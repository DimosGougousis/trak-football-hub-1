import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SliderInput } from '@/components/trak/SliderInput'

// TRAK-182 (Imad, 16 Oct): the assessment slider's dots are evenly spaced, as
// on Arc's elastic slider; the band edges (2, 4, 6, 7, 8, 9) bunched up.
describe('the assessment slider', () => {
  it('draws its dots at even intervals along the track', () => {
    const { container } = render(<SliderInput label="Work Rate" value={5} onChange={() => {}} />)
    const dots = [...container.querySelectorAll<HTMLElement>('span[style*="left"]')].map(dot => dot.style.left)
    expect(dots).toEqual(['20%', '40%', '60%', '80%'])
  })

  // TRAK-555 (Imad, 23 Nov): each score has its own fill colour; band badges keep BANDS.
  it('fills the track in its own colour for each score from 0 to 10', () => {
    const expected = ['#DC2626', '#DC2626', '#EA580C', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#059669', '#5B21B6']
    const fills = expected.map((_, score) => {
      const { container, unmount } = render(<SliderInput label="Work Rate" value={score} onChange={() => {}} />)
      const fill = (container.firstElementChild as HTMLElement).style.getPropertyValue('--control-fill')
      unmount()
      return fill
    })
    expect(fills).toEqual(expected)
  })
})
