import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EvaluationRhythm } from '@/components/coach/season-plan/EvaluationRhythm'

/** TRAK-525 (Reports 2/10): four choices; Custom asks for 2 to 26 weeks; a plan saved as every 2 weeks shows as Custom. */
afterEach(cleanup)

const show = (every: string, onChange = vi.fn()) => {
  render(<EvaluationRhythm every={every as never} day={0} onChange={onChange} line="" />)
  return { onChange, group: screen.getByRole('group', { name: 'Evaluate each player' }) }
}

describe('TRAK-525 the rhythm choices', () => {
  it('offers every month, every 3 months, every 6 months and Custom, and no weeks field for a month choice', () => {
    const { group } = show('month')
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['Every month', 'Every 3 months', 'Every 6 months', 'Custom'])
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('shows a plan saved as every 2 weeks as Custom, 2 weeks, on a day', () => {
    const { group } = show('2w')
    expect(within(group).getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('spinbutton')).toHaveValue('2')
    expect(screen.getByRole('group', { name: 'On a' })).toBeInTheDocument()
  })

  it('Custom starts at 6 weeks, and the weeks stay between 2 and 26', async () => {
    const { group, onChange } = show('month')
    await userEvent.click(within(group).getByRole('button', { name: 'Custom' }))
    expect(onChange).toHaveBeenLastCalledWith({ every: '6w', day: 0 })
    cleanup()
    const custom = show('26w')
    await userEvent.click(screen.getByRole('button', { name: /increase/i }))
    expect(custom.onChange).not.toHaveBeenCalledWith({ every: '27w', day: 0 })
  })
})
