import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

export type UseCaseStatus = 'enforced' | 'pending' | 'parked'
export type Actor = 'athlete' | 'coach' | 'parent' | 'system'

export interface UseCase {
  id: string
  actor: Actor
  title: string
  requirement: string
  status: UseCaseStatus
  tier: number[]
  spec_version: number
  given: string
  when: string
  then: string[]
  source: string
}

export interface Registry {
  version: number
  owner: string
  use_cases: UseCase[]
}

export const REGISTRY_PATH = resolve(process.cwd(), 'docs/use-cases/registry.yaml')

let cached: Registry | null = null

export function loadRegistry(): Registry {
  if (cached) return cached
  cached = parse(readFileSync(REGISTRY_PATH, 'utf8')) as Registry
  return cached
}

export function getUseCase(id: string): UseCase {
  const found = loadRegistry().use_cases.find(uc => uc.id === id)
  if (!found) {
    throw new Error(
      `Unknown use case "${id}". Every test must bind to an entry in docs/use-cases/registry.yaml.`,
    )
  }
  return found
}
