import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** TRAK-163: parent Home switches child from the header's "Following" menu (Arc dropdown). */
export async function followChild(name: string) {
  await userEvent.click(within(await screen.findByRole('group', { name: 'Following' })).getByRole('button'))
  await userEvent.click(await screen.findByRole('menuitem', { name }))
}

/** The child parent Home's header is following. */
export const followedChild = () => within(screen.getByRole('group', { name: 'Following' })).getByRole('button')
