import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CalendarDays, Repeat } from 'lucide-react'
import { PageTop } from '@/components/coach/PageTop'
import { DetailsStrip } from '@/components/trak/standard'

/** Design standard step 1 (TRAK-768): the page title's style, a subtitle and pill beside it, and the details strip. */
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'coach-768' }, profile: { role: 'coach', full_name: 'Sam Coach' } }) }))
afterEach(cleanup)

describe('the standard page header', () => {
  it('PageTop shows the title as h1 in the standard style', () => {
    render(<PageTop title="Squad" menu={false} />)
    const title = screen.getByRole('heading', { level: 1, name: 'Squad' })
    expect(title.className).toContain('font-extrabold')
    expect(title.className).toContain('text-[28px]')
    expect(title.className).toContain('tablet:text-[32px]')
  })

  it('PageTop shows subtitle and pill beside the title', () => {
    render(<PageTop title="Season plan" menu={false} subtitle="U16 · 15 players" pill={<span>Shared 22 Nov</span>} />)
    const row = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(row.textContent).toContain('U16 · 15 players')
    expect(row.textContent).toContain('Shared 22 Nov')
  })

  it("DetailsStrip lists each item's label and value, the callout and the action", () => {
    render(<DetailsStrip items={[{ icon: CalendarDays, label: 'Season', value: '3 Aug 2026 — 30 May 2027' }, { icon: Repeat, label: 'Reports', value: 'Monthly' }]}
      callout="Next report: Sun 29 Nov 2026" action={<button type="button">Edit schedule</button>} />)
    for (const text of ['Season', '3 Aug 2026 — 30 May 2027', 'Reports', 'Monthly', 'Next report: Sun 29 Nov 2026']) expect(screen.getByText(text)).toBeTruthy()
    expect(screen.getByText('3 Aug 2026 — 30 May 2027').className).toContain('tabular-nums')
    expect(screen.getByRole('button', { name: 'Edit schedule' })).toBeTruthy()
  })
})
