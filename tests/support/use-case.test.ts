import { describe, it, expect } from 'vitest'
import { useCase } from './use-case'

describe('useCase binding', () => {
  it('throws on an unknown use-case id', () => {
    expect(() => useCase('UC-Z99', () => {})).toThrow(/UC-Z99/)
  })
})

useCase('UC-A02', () => {
  it('runs inside a suite bound to a real registry entry', () => {
    expect(true).toBe(true)
  })
})
