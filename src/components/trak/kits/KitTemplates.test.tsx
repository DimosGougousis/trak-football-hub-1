import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { KIT_COLLECTIONS, type KitSlot } from '@/lib/kit-templates'
import { KitPicker } from './KitPicker'
import { KitAnnouncement } from './KitAnnouncement'

const kits = KIT_COLLECTIONS[0].kits
function Selection() {
  const [slot, setSlot] = useState<KitSlot>('home')
  return <><KitPicker kits={kits} value={slot} onChange={setSlot} /><KitAnnouncement kit={kits[slot]} slot={slot} /></>
}

describe('kit selection and announcement', () => {
  it('shows the selected complete kit to the family after keyboard selection', async () => {
    const user = userEvent.setup()
    render(<Selection />)
    await user.tab()
    expect(screen.getByRole('radio', { name: /^Home/ })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: /^Away/ })).toBeChecked()
    const announcement = screen.getByRole('region', { name: 'What to wear' })
    expect(within(announcement).getByRole('heading', { name: 'Away kit' })).toBeVisible()
    expect(within(announcement).getByRole('img')).toHaveAccessibleName('Away kit: White shirt, burgundy trim, burgundy shorts, white socks')
  })

  it('keeps multiple pickers and SVG clipping IDs independent on the same page', () => {
    const { container } = render(<><Selection /><Selection /></>)
    const ids = [...container.querySelectorAll('[id]')].map(element => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(screen.getAllByRole('radio', { name: /^Home/ }).every(radio => (radio as HTMLInputElement).checked)).toBe(true)
    const names = new Set([...container.querySelectorAll('input')].map(input => input.name))
    expect(names.size).toBe(2)
  })

  it('never invents a home kit when the coach has not specified a kit', () => {
    render(<KitAnnouncement />)
    expect(screen.getByText('Kit to be confirmed by the coach.')).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
