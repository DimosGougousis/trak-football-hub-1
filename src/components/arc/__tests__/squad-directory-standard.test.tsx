/**
 * Design standard step 3: the Players list. Dimos (24 Nov): the players are grouped from Attackers down to
 * Goalkeepers, each group a cluster of its own, and the performance graph beside each player goes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GROUP_ORDER, SquadDirectory, type SquadPlayer } from '../blocks/team-directory/squad-directory'
import { SECTION_LABEL } from '@/components/trak/standard'

afterEach(cleanup)
const ROOT = join(__dirname, '..', '..', '..')
const css = readFileSync(join(ROOT, 'components', 'arc', 'blocks', 'team-directory', 'squad-directory.module.css'), 'utf8')
const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

const p = (id: string, name: string, group: SquadPlayer['group'], shirt: number | null, extra: Partial<SquadPlayer> = {}): SquadPlayer =>
  ({ id, name, position: group ?? '', group, shirt, band: null, move: 0, ...extra })
const SQUAD = [p('1', 'Noah', 'GK', 1), p('2', 'Owen', 'DEF', 5), p('3', 'Toby', 'ATT', 15), p('4', 'Liam', 'MID', 10), p('5', 'Kai', 'ATT', 11), p('6', 'Sam', null, null)]

const headings = () => within(screen.getByRole('list', { name: 'Players' })).getAllByRole('heading', { level: 3 }).map(h => h.textContent)
const order = () => [...screen.getByRole('list', { name: 'Players' }).querySelectorAll('h3, [role="listitem"], li:not([role])')]
  .map(el => el.tagName === 'H3' ? `# ${el.textContent}` : el.querySelector('button')?.textContent?.split(/(?=[A-Z][a-z]+er|No position)/)[0] ?? '')

describe('the Players list, grouped by line', () => {
  it('groups players from Attackers down to Goalkeepers', () => {
    render(<SquadDirectory title="U16 players" players={SQUAD} onOpen={() => {}} />)
    expect(GROUP_ORDER).toEqual(['ATT', 'MID', 'DEF', 'GK'])
    expect(headings()).toEqual(['Attackers 2', 'Midfielders 1', 'Defenders 1', 'Goalkeepers 1', 'No position yet 1'])
    const list = screen.getByRole('list', { name: 'Players' })
    const names = [...list.querySelectorAll('h3, button')].map(el => el.tagName === 'H3' ? `# ${el.firstChild?.textContent}` : within(el as HTMLElement).getAllByText(/^[A-Z][a-z]+$/)[0].textContent)
    expect(names).toEqual(['# Attackers', 'Kai', 'Toby', '# Midfielders', 'Liam', '# Defenders', 'Owen', '# Goalkeepers', 'Noah', '# No position yet', 'Sam'])
    // Still one list of players, a list item each.
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
  })

  it('an empty group is left out', () => {
    render(<SquadDirectory title="U16 players" players={SQUAD.filter(x => x.group !== 'DEF')} onOpen={() => {}} />)
    expect(headings()).not.toContain('Defenders 1')
    expect(headings().some(h => h?.startsWith('Defenders'))).toBe(false)
  })

  it('the position filter shows one group, its options top-down', async () => {
    render(<SquadDirectory title="U16 players" players={SQUAD} onOpen={() => {}} />)
    const filter = screen.getByRole('radiogroup', { name: 'Filter by position' })
    expect(within(filter).getAllByRole('radio').map(r => r.textContent)).toEqual(['All', 'ATT', 'MID', 'DEF', 'GK'])
    await userEvent.setup().click(within(filter).getByRole('radio', { name: 'MID' }))
    await waitFor(() => expect(headings()).toEqual(['Midfielders 1']))
  })

  it('search keeps the groups', async () => {
    render(<SquadDirectory title="U16 players" players={SQUAD} onOpen={() => {}} />)
    await userEvent.setup().type(screen.getByRole('searchbox'), 'o')
    await waitFor(() => expect(headings()).toEqual(['Attackers 1', 'Defenders 1', 'Goalkeepers 1']))
  })

  it('no rating graph beside a player', () => {
    render(<SquadDirectory title="U16 players" players={SQUAD.map(x => ({ ...x, trend: [6, 7, 8] }) as SquadPlayer)} onOpen={() => {}} />)
    expect(screen.getByRole('list', { name: 'Players' }).querySelector('figure, svg[role="img"]')).toBeNull()
    const tab = readFileSync(join(ROOT, 'components', 'coach', 'squad', 'PlayersTab.tsx'), 'utf8')
    for (const gone of ['Sparkline', 'trend', 'TREND']) expect([gone, tab.includes(gone)]).toEqual([gone, false])
    const block = readFileSync(join(ROOT, 'components', 'arc', 'blocks', 'team-directory', 'squad-directory.tsx'), 'utf8')
    expect(block).not.toContain('Sparkline')
  })

  it('group labels in the standard style, with Greek words', () => {
    render(<SquadDirectory title="U16 players" players={SQUAD} onOpen={() => {}} />)
    const label = within(screen.getByRole('list', { name: 'Players' })).getAllByRole('heading', { level: 3 })[0]
    expect(label.className).toContain(SECTION_LABEL)
    expect(label.querySelector('.tabular-nums')?.textContent).toBe('2')
    const el = JSON.parse(readFileSync(join(ROOT, 'locales', 'el', 'coachSquad.json'), 'utf8'))
    for (const key of ['groupATT', 'groupMID', 'groupDEF', 'groupGK']) expect([key, !!el[key]]).toEqual([key, true])
  })

  it('header, search and names at the standard sizes', () => {
    expect(rule('.header h2')).toMatch(/font-size:\s*20px/)
    expect(rule('.header h2')).toMatch(/font-weight:\s*700/)
    expect(rule('.search')).toMatch(/height:\s*44px/)
    expect(rule('.personName')).toMatch(/font-size:\s*15px/)
    expect(rule('.personName')).toMatch(/font-weight:\s*600/)
  })

  it('a player waiting for consent says so in a needs pill', () => {
    render(<SquadDirectory title="U16 players" players={[p('7', 'Ada', 'MID', 8, { waiting: true })]} onOpen={() => {}} />)
    expect(screen.getByText('Waiting for consent').getAttribute('data-tone')).toBe('needs')
    const needs = rule('.chip[data-tone="needs"]')
    expect(needs).toMatch(/color:\s*var\(--warning\)/)
    expect(needs).toMatch(/background:\s*color-mix\(in oklab, var\(--attention\) 10%, transparent\)/)
    expect(needs).toMatch(/border-color:\s*color-mix\(in oklab, var\(--attention\) 25%, transparent\)/)
  })
})
