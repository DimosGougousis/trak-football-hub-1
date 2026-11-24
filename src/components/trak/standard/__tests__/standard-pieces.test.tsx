import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { NumberBlock, SECTION_LABEL, SectionCard, SectionLabel, StatusPill } from '@/components/trak/standard'

/** Design standard step 1 (TRAK-768): the shared pieces every page is rebuilt with. */
afterEach(cleanup)

describe('the standard pieces', () => {
  it('SectionLabel renders an h2 with the label style and its action', () => {
    render(<SectionLabel action={<button type="button">Edit</button>}>Season objectives</SectionLabel>)
    const heading = screen.getByRole('heading', { level: 2, name: 'Season objectives' })
    expect(heading.className).toBe(SECTION_LABEL)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('StatusPill good shows a check and success colours', () => {
    const { container } = render(<StatusPill tone="good">All placed</StatusPill>)
    const pill = container.firstElementChild as HTMLElement
    expect(pill.className).toContain('text-success')
    expect(pill.className).toContain('bg-success/10')
    expect(pill.querySelector('svg')).toBeTruthy()
    expect(pill.textContent).toBe('All placed')
  })

  it('StatusPill needs shows a dot', () => {
    const { container } = render(<StatusPill tone="needs">1 missing</StatusPill>)
    const pill = container.firstElementChild as HTMLElement
    expect(pill.className).toContain('text-warning')
    expect(pill.querySelector('[data-dot]')?.className).toContain('bg-attention')
    expect(pill.querySelector('svg')).toBeNull()
  })

  it('StatusPill neutral shows no icon', () => {
    const { container } = render(<StatusPill tone="neutral">Default</StatusPill>)
    const pill = container.firstElementChild as HTMLElement
    expect(pill.querySelector('svg, [data-dot]')).toBeNull()
    expect(pill.className).toContain('bg-raised')
  })

  it('NumberBlock exposes progress as a progressbar at 93 for 14/15', () => {
    render(<NumberBlock value="14 / 15" caption="have 1–2 objectives" progress={14 / 15} tone="needs" />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('93')
    expect((bar.firstElementChild as HTMLElement).className).toContain('bg-attention')
    expect(screen.getByText('14 / 15').className).toContain('tabular-nums')
  })

  it('NumberBlock omits the bar without progress', () => {
    render(<NumberBlock value="15" caption="players" />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('SectionCard renders its title as h3, pill, action and footer in order', () => {
    render(<SectionCard title="Positions" pill={<StatusPill tone="good">All placed</StatusPill>}
      action={<button type="button">View pitch</button>} footer={<p>Footer</p>}><p>Body</p></SectionCard>)
    const card = screen.getByRole('region', { name: 'Positions' })
    const order = [within(card).getByRole('heading', { level: 3 }), within(card).getByText('All placed'),
      within(card).getByRole('button', { name: 'View pitch' }), within(card).getByText('Body'), within(card).getByText('Footer')]
    for (let i = 1; i < order.length; i++)
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.className).toContain('rounded-2xl')
  })

  it('no piece uses a colour outside the tokens', () => {
    const { container } = render(<>
      <SectionLabel>A</SectionLabel>
      {(['good', 'needs', 'neutral'] as const).map(tone => <StatusPill key={tone} tone={tone}>{tone}</StatusPill>)}
      <NumberBlock value="1" caption="c" progress={0.5} />
      <SectionCard title="T" footer="F">B</SectionCard>
    </>)
    const classes = [...container.querySelectorAll('*')].map(el => el.getAttribute('class') ?? '').join(' ')
    expect(classes).not.toMatch(/(slate|emerald|amber|gray)-\d/)
  })
})
