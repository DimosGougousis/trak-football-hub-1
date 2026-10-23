import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** TRAK-272: a Schedule card's Cancel or Delete sits behind its button group's More menu. */
export async function chooseMore(title: string, action: 'Cancel event' | 'Delete draft') {
  await userEvent.click(screen.getByRole('button', { name: `More actions for ${title}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

/** The actions a card's More menu offers, closed again after looking. */
export async function moreActions(title: string): Promise<string[]> {
  const trigger = screen.queryByRole('button', { name: `More actions for ${title}` })
  if (!trigger) return []
  await userEvent.click(trigger)
  const items = (await screen.findAllByRole('menuitem')).map(item => item.textContent?.trim() ?? '')
  await userEvent.keyboard('{Escape}')
  return items
}
