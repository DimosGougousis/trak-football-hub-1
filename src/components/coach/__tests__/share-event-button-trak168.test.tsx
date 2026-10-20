/**
 * TRAK-168 (Imad, 18 Oct): "Share to WhatsApp" becomes "Share". On a phone it opens the
 * phone's share sheet with the message, so the coach picks Viber or WhatsApp; without a
 * share sheet (a desktop browser) it falls back to WhatsApp's link. Nothing is sent until
 * the coach picks a chat either way.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareEventButton } from '../ShareEventButton'

const TEXT = '*❌ CANCELLED | U14 Training*\n🔗 Event details: https://trakfootball.com/event/ev-1'

afterEach(() => {
  cleanup()
  // jsdom has no share sheet; each test that adds one removes it.
  delete (navigator as { share?: unknown }).share
})

describe('TRAK-168: Share opens the phone share sheet', () => {
  it('with a share sheet: a Share button that hands the message to it, and no WhatsApp link', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    render(<ShareEventButton text={TEXT}>Share</ShareEventButton>)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(share).toHaveBeenCalledWith({ text: TEXT })
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('closing the share sheet without picking a chat is not an error', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ShareEventButton text={TEXT}>Share</ShareEventButton>)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it("without a share sheet: WhatsApp's link with the same message, in a new tab", () => {
    render(<ShareEventButton text={TEXT}>Share</ShareEventButton>)
    const link = screen.getByRole('link', { name: 'Share' })
    expect(link).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(TEXT)}`)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('an icon-only share is named for screen readers', () => {
    render(<ShareEventButton text={TEXT} aria-label="Share Finishing" />)
    expect(screen.getByRole('link', { name: 'Share Finishing' })).toBeInTheDocument()
  })
})
