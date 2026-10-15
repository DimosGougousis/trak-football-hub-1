import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * TRAK-182: the assessment screen is one step per screen (Player, Ratings,
 * Message, Note, Review). Tests walk it the way a coach does: Next and Back.
 */
const STEPS = ['Player', 'Ratings', 'Message', 'Note', 'Review'] as const
export type AssessStep = typeof STEPS[number]

const current = (): number => {
  const label = document.querySelector('[aria-current="step"]')?.textContent ?? ''
  return STEPS.findIndex(step => label.includes(step))
}

export const nextButton = () => screen.getByRole('button', { name: 'Next' })

/** Goes to a step; Next must be open (a player who can be assessed, loaded). */
export async function assessStep(step: AssessStep) {
  const target = STEPS.indexOf(step)
  for (let guard = 0; guard < STEPS.length && current() !== target; guard++) {
    if (current() < target) {
      await waitFor(() => expect(nextButton()).toBeEnabled())
      await userEvent.click(nextButton())
    } else {
      await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    }
  }
  expect(current()).toBe(target)
}

/** Review's save: Publish when there is a message, otherwise Save. */
export async function saveAssessment() {
  await assessStep('Review')
  await userEvent.click(screen.queryByRole('button', { name: 'Publish' }) ?? screen.getByRole('button', { name: 'Save' }))
}
