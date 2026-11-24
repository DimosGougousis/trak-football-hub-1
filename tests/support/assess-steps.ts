import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * TRAK-559: the assessment screen is 3 steps: Player & bands, then Objectives & notes ("Message & note" where the squad
 * has no shared plan), then Review. Tests walk it the way a coach does: Next and "Back to <step>" (the header's plain
 * Back leaves the screen). Older names still work: Ratings is the first step, Message and Note the second.
 */
export type AssessStep = 'Player' | 'Ratings' | 'Message' | 'Note' | 'Review'
const STEP_OF: Record<AssessStep, number> = { Player: 0, Ratings: 0, Message: 1, Note: 1, Review: 2 }
const LABELS = [/Player/, /Message|Objectives/, /Review/]

const current = (): number => {
  const label = document.querySelector('[aria-current="step"]')?.textContent ?? ''
  return LABELS.findIndex(pattern => pattern.test(label))
}

export const nextButton = () => screen.getByRole('button', { name: 'Next' })

/** Goes to a step; Next must be open (a player who can be assessed, loaded). */
export async function assessStep(step: AssessStep) {
  const target = STEP_OF[step]
  for (let guard = 0; guard < LABELS.length && current() !== target; guard++) {
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
