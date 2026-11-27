import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { i18n, showLanguage, SOURCE_LANGUAGE } from '@/lib/i18n'
import { coachWeek, squadName } from '@/lib/coach-week'
import { needsYou } from '@/lib/coach-needs-you'
import { TodoList } from '@/components/coach/home/TodoList'
import { LoadError } from '@/components/trak/LoadError'
import type { EventRow } from '@/lib/coach-events'

/* TRAK-407 (Languages 2/8, first part): the coach's Home in Greek. The words worked out away from the screen (the
   week's notes, who needs the coach and why) are Greek too, and English is as it was. */

const DAY = 86_400_000
const now = Date.parse('2026-11-11T12:00:00Z')
const player = { id: 'p1', player_name: 'Alex Stone', created_at: new Date(now - 30 * DAY).toISOString() }

afterEach(async () => {
  await i18n.changeLanguage(SOURCE_LANGUAGE)
  localStorage.clear()
})

const reasons = () => needsYou({ players: [player], waitingForParent: new Set(), assessments: [], now }).map(item => item.reason)
const draft = { id: 'e1', title: 'Training', event_type: 'training', event_date: '2026-11-12', start_time: '18:00', starts_at: '2026-11-12T16:00:00Z',
  published: false, squad: null } as unknown as EventRow
const notes = () => [...coachWeek({ dates: ['2026-11-12'], events: [draft], sessions: [], inView: () => true, now: new Date(now) }).values()].flat().map(item => item.note)

describe('TRAK-407: the coach\'s Home in Greek', () => {
  it('says why a player needs the coach, in English and in Greek', async () => {
    expect(reasons()).toEqual(['Never assessed, 4 weeks in the squad'])
    await showLanguage('el')
    expect(reasons()).toEqual(['Δεν έχει αξιολογηθεί ποτέ, 4 εβδομάδες στην ομάδα'])
  })

  it('writes the week\'s notes and the squad\'s name in the language showing', async () => {
    expect(notes()).toEqual(['Draft · only you see it'])
    expect(squadName(null)).toBe('All squads')
    await showLanguage('el')
    expect(notes()).toEqual(['Πρόχειρο · το βλέπετε μόνο εσείς'])
    expect(squadName(null)).toBe('Όλες οι ομάδες')
    expect(squadName('U14')).toBe('U14')
  })

  it('counts in Greek\'s own plural forms', async () => {
    await showLanguage('el')
    expect(i18n.t('coachHome:needPosition', { count: 1 })).toBe('1 παίκτης χρειάζεται θέση')
    expect(i18n.t('coachHome:needPosition', { count: 3 })).toBe('3 παίκτες χρειάζονται θέση')
  })

  // TRAK-614: the To-do took Needs you's and Squad shape's place.
  it('shows the To-do and a failed load in Greek', async () => {
    await showLanguage('el')
    render(<>
      <TodoList items={[]} failed={false} onRetry={() => {}} coachId="c" showSquad={false} onChanged={() => {}} onOpenReports={() => {}} />
      <LoadError what={i18n.t('coachHome:weekWhat')} onRetry={() => {}} />
    </>)
    expect(screen.getByRole('heading', { name: 'Εκκρεμότητες' })).toBeInTheDocument()
    expect(screen.getByText('Τίποτα για σήμερα.')).toBeInTheDocument()
    expect(screen.getByText('Δεν μπορέσαμε να φορτώσουμε αυτή την εβδομάδα αυτή τη στιγμή. Τα στοιχεία σας δεν άλλαξαν.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ξανά' })).toBeInTheDocument()
  })

  it('keeps English as it was', () => {
    render(<TodoList items={[]} failed={false} onRetry={() => {}} coachId="c" showSquad={false} onChanged={() => {}} onOpenReports={() => {}} />)
    expect(screen.getByRole('heading', { name: 'To-do' })).toBeInTheDocument()
    expect(screen.getByText('Nothing to do today.')).toBeInTheDocument()
  })
})
