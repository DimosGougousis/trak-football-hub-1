import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CoachAssessmentCard } from '@/components/coach/CoachAssessmentCard'

/** TRAK-526 (Imad, 21 Nov): the card shows the date it was saved top right; opened, each objective and its answer, then
 *  the message and the note as before. Synthetic player. */
afterEach(cleanup)

const assessment = { id: 'as-1', created_at: '2026-11-21T10:00:00Z', published_at: '2026-11-21T10:00:00Z',
  work_rate: 7, tactical: 6, attitude: 8, technical: 6, physical: 7, coachability: 8 }
const show = (objectives?: Parameters<typeof CoachAssessmentCard>[0]['objectives'], objectivesFailed = false) =>
  render(<MemoryRouter><CoachAssessmentCard assessment={assessment as never} playerName="Alex Synthetic" message="Keep going"
    objectives={objectives} objectivesFailed={objectivesFailed} /></MemoryRouter>)

describe('TRAK-526: the assessment card', () => {
  it('shows the date top right, and opened, each objective with its answer before the message', async () => {
    show([{ title: 'Shoot first time', status: 'on_track' }, { title: 'Press from the front', status: 'met' }, { title: 'Scan before receiving', status: 'added' }])
    expect(screen.getByText('21 Nov')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('heading', { name: 'Published' })).getByRole('button'))
    const panel = await screen.findByRole('dialog')
    const rows = within(panel).getAllByRole('listitem').map(item => item.textContent)
    expect(rows).toEqual(['Shoot first timeOn track', 'Press from the frontMet', 'Scan before receivingAdded'])
    expect(within(panel).getByText('Keep going')).toBeInTheDocument()
  })

  it('says when the objectives could not be read, and shows nothing for an assessment without any', async () => {
    show(undefined, true)
    await userEvent.click(within(screen.getByRole('heading', { name: 'Published' })).getByRole('button'))
    expect(await screen.findByText("Couldn't load the objectives.")).toBeInTheDocument()
    cleanup()
    show([])
    await userEvent.click(within(screen.getByRole('heading', { name: 'Published' })).getByRole('button'))
    expect(await screen.findByText('Keep going')).toBeInTheDocument()
    expect(screen.queryByText('OBJECTIVES')).toBeNull()
  })
})
