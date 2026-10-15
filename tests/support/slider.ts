import { fireEvent } from '@testing-library/react'

// TRAK-182: assessment sliders are Arc's elastic slider (role="slider" with
// aria-valuenow), not a native <input type="range">, so tests drive them the
// way a keyboard user does: Home to the minimum, then one ArrowRight per step.
export function setSlider(slider: HTMLElement, value: number) {
  fireEvent.keyDown(slider, { key: 'Home' })
  for (let i = 0; i < value; i++) fireEvent.keyDown(slider, { key: 'ArrowRight' })
}
export const sliderValue = (slider: HTMLElement) => Number(slider.getAttribute('aria-valuenow'))
export const sliderDisabled = (slider: HTMLElement) => slider.getAttribute('aria-disabled') === 'true'
