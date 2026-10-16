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
})
