import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * TRAK-182: the assessment screen is one step per screen (Player, Ratings,
 * Message & note, Review). Tests walk it the way a coach does: Next and
 * "Back to <step>" (the header's plain Back leaves the screen).
 */
// Message and the private note share one step since 16 Oct ("Message & note").
const STEPS = ['Player', 'Ratings', 'Message', 'Review'] as const
export type AssessStep = typeof STEPS[number] | 'Note'
const indexOf = (step: AssessStep) => STEPS.indexOf(step === 'Note' ? 'Message' : step)

const current = (): number => {
  const label = document.querySelector('[aria-current="step"]')?.textContent ?? ''
  return STEPS.findIndex(step => label.includes(step))
}

export const nextButton = () => screen.getByRole('button', { name: 'Next' })

/** Goes to a step; Next must be open (a player who can be assessed, loaded). */
export async function assessStep(step: AssessStep) {
  const target = indexOf(step)
  for (let guard = 0; guard < STEPS.length && current() !== target; guard++) {
    if (current() < target) {
      await waitFor(() => expect(nextButton()).toBeEnabled())
      await userEvent.click(nextButton())
    } else {
      await userEvent.click(screen.getByRole('button', { name: /^Back to / }))
    }
  }
  expect(current()).toBe(target)
}

/** Review's save: Publish when there is a message, otherwise Save. */
export async function saveAssessment() {
  await assessStep('Review')
  await userEvent.click(screen.queryByRole('button', { name: 'Publish' }) ?? screen.getByRole('button', { name: 'Save' }))
}
