import { describe, it, expect } from 'vitest'
import { useCase } from './use-case'

describe('useCase binding', () => {
  it('throws on an unknown use-case id', () => {
    expect(() => useCase('UC-Z99', () => {})).toThrow(/UC-Z99/)
  })
})

useCase('UC-A02', () => {
  it('names the suite after the bound use case\'s id and title', () => {
    // useCase() builds the describe() title as `${uc.id} · ${uc.title}` —
    // assert that binding actually happened, rather than a tautology that
    // would pass whether or not useCase() ran at all.
    const suite = expect.getState().currentTestName
    expect(suite).toMatch(/^UC-A02 · /)
    expect(suite).toContain('Log a match with position inputs and live band preview')
  })
})
