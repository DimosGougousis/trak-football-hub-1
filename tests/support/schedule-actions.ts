import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** TRAK-275: a Schedule card's Cancel or Delete is an icon in its button group, named "Cancel <title>". */
export async function chooseCardAction(title: string, action: 'Cancel' | 'Delete') {
  await userEvent.click(screen.getByRole('button', { name: `${action} ${title}` }))
}

/** Which of Cancel and Delete a card offers. */
export function endActions(title: string): string[] {
  return (['Cancel', 'Delete'] as const).filter(action => screen.queryByRole('button', { name: `${action} ${title}` }))
}
