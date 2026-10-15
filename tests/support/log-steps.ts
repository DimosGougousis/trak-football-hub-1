import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * TRAK-182: the match and training log is one step per screen, ending in
 * Review. Tests walk it the way a coach does: Next and "Back to <step>".
 */
const NAMES = ['Match', 'Squad', 'Session', 'Load', 'Attendance', 'Event', 'Notes', 'Review']
const nameIn = (text: string | null) => NAMES.find(name => (text ?? '').includes(name)) ?? ''
const current = () => nameIn(document.querySelector('[aria-current="step"]')?.textContent ?? '')

/** Goes forward or back to the step named `step` (Match, Squad, Session, Load, Attendance, Notes, Review…). */
export async function logStep(step: string) {
  const order = [...document.querySelectorAll('[aria-label="Log steps"] li')].map(li => nameIn(li.textContent))
  const target = order.indexOf(step)
  for (let guard = 0; guard < 6 && current() !== step; guard++) {
    const at = order.indexOf(current())
    await userEvent.click(at < target
      ? screen.getByRole('button', { name: 'Next' })
      : screen.getByRole('button', { name: /^Back to / }))
  }
  expect(current()).toBe(step)
}

/** Review's save: "Save match" or "Save session". */
export async function saveLog(name: 'Save match' | 'Save session') {
  await logStep('Review')
  await userEvent.click(screen.getByRole('button', { name }))
}

/** A training with its first step filled (Technical), moved on to `step`. */
export async function trainingAt(step: string) {
  await userEvent.click(await screen.findByRole('button', { name: /^Technical/ }))
  await logStep(step)
}

/** A match with its first step filled (an opponent, 1–0), moved on to `step`. */
export async function matchAt(step: string, opponent = 'Synthetic Rovers') {
  await userEvent.type(await screen.findByPlaceholderText('Opponent name'), opponent)
  const [us, them] = screen.getAllByPlaceholderText('0')
  await userEvent.type(us, '1')
  await userEvent.type(them, '0')
  await logStep(step)
}
