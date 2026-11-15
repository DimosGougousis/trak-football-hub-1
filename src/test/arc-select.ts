import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Opens an Arc Select by keyboard (jsdom has no pointer capture for Radix) and clicks the option shown as `option`. */
export async function pickOption(name: string, option: string | RegExp) {
  await waitFor(() => expect(screen.getByRole('combobox', { name })).toBeEnabled())
  screen.getByRole('combobox', { name }).focus()
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

/** The options an Arc Select offers: they exist only while it is open, so open it, read them and close it again. */
export async function listOptions(name: string) {
  await waitFor(() => expect(screen.getByRole('combobox', { name })).toBeEnabled())
  screen.getByRole('combobox', { name }).focus()
  await userEvent.keyboard('{Enter}')
  const names = (await screen.findAllByRole('option')).map(o => o.textContent ?? '')
  await userEvent.keyboard('{Escape}')
  return names
}
