import { describe, it, expect } from 'vitest'
import { loadRegistry, getUseCase } from './registry'

describe('use-case registry', () => {
  it('loads every use case with the required fields', () => {
    const registry = loadRegistry()
    expect(registry.use_cases.length).toBeGreaterThan(0)
    for (const uc of registry.use_cases) {
      expect(uc.id).toMatch(/^UC-[A-Z]\d{2}$/)
      expect(['athlete', 'coach', 'parent', 'system']).toContain(uc.actor)
      expect(['enforced', 'pending', 'parked']).toContain(uc.status)
      expect(uc.title.length).toBeGreaterThan(0)
      expect(uc.given.length).toBeGreaterThan(0)
      expect(uc.when.length).toBeGreaterThan(0)
      expect(uc.then.length).toBeGreaterThan(0)
      expect(uc.spec_version).toBeGreaterThanOrEqual(1)
      expect(Array.isArray(uc.tier)).toBe(true)
    }
  })

  it('has no duplicate ids', () => {
    const ids = loadRegistry().use_cases.map(uc => uc.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves a known use case by id', () => {
    expect(getUseCase('UC-A02').requirement).toBe('REQ-001')
  })

  it('throws on an unknown id', () => {
    expect(() => getUseCase('UC-Z99')).toThrow(/UC-Z99/)
  })
})
