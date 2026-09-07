import { describe } from 'vitest'
import { getUseCase } from './registry'

/**
 * Binds a test suite to a use case in docs/use-cases/registry.yaml.
 * Throws immediately on an unknown id so a typo cannot silently create an
 * untracked test. Parked use cases are skipped rather than run.
 */
export function useCase(id: string, fn: () => void): void {
  const uc = getUseCase(id)
  const title = `${uc.id} · ${uc.title}`
  if (uc.status === 'parked') {
    describe.skip(title, fn)
    return
  }
  describe(title, fn)
}
