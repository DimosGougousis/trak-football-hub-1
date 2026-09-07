import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

export const REGISTRY_PATH = resolve('docs/use-cases/registry.yaml')
export const LOCK_PATH = resolve('docs/use-cases/registry.lock.json')
export const QUESTIONS_PATH = resolve('docs/use-cases/OPEN-QUESTIONS.md')

export function loadRegistry() {
  return parse(readFileSync(REGISTRY_PATH, 'utf8'))
}

/**
 * Hashes the product owner's words plus the status. Any edit to given/when/
 * then without a spec_version bump changes this hash and is refused.
 */
export function hashUseCase(uc) {
  const material = JSON.stringify({
    given: uc.given,
    when: uc.when,
    then: uc.then,
    status: uc.status,
  })
  return createHash('sha256').update(material).digest('hex')
}

export function readLock() {
  if (!existsSync(LOCK_PATH)) return null
  return JSON.parse(readFileSync(LOCK_PATH, 'utf8'))
}

export function writeLock(registry) {
  const lock = {}
  for (const uc of registry.use_cases) {
    lock[uc.id] = { spec_version: uc.spec_version, hash: hashUseCase(uc) }
  }
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n')
  return lock
}
