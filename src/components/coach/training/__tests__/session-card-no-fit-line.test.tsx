// Kostas, 19 Nov: "Your session" shows "90 of 90 min" beside its title; the line under the bar
// ("Fits your 90 minutes.", "5 min over…", "10 min spare.") repeated it, so it's gone.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/lib/i18n'
import { SessionCard } from '@/components/coach/training/PlannerParts'
import type { Part } from '@/lib/training/parts'

const part = (key: string, minutes: number): Part => ({ key, type: 'own', name: key, minutes, drill: null })
const card = (parts: Part[]) => render(<SessionCard parts={parts} length={90} current={parts[0].key}
  onOpen={vi.fn()} onAdd={vi.fn()} onReview={vi.fn()} onStandard={vi.fn()}
  fromShape={false} standard />)

describe('Your session: the total is said once', () => {
  it.each([
    ['fits', [part('a', 45), part('b', 45)], '90 of 90 min'],
    ['over', [part('a', 50), part('b', 45)], '95 of 90 min'],
    ['spare', [part('a', 40), part('b', 40)], '80 of 90 min'],
  ])('%s: "N of 90 min" stays, the line under the bar is gone', (_label, parts, total) => {
    card(parts)
    expect(screen.getByText(total)).toBeTruthy()
    expect(screen.queryByText(/Fits your|min over|min spare/)).toBeNull()
  })
})
