import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRelative } from '../../tests/support/repo-path'

// Credential paths use forward slashes on every contributor's machine,
// Windows included (#166).
describe('repoRelative', () => {
  it('gives forward slashes under Windows path rules', () => {
    expect(repoRelative('C:\\trak', 'C:\\trak\\docs\\reviews\\a.md', path.win32)).toBe('docs/reviews/a.md')
  })

  it('leaves POSIX paths as they are', () => {
    expect(repoRelative('/trak', '/trak/src/__tests__/a.ts', path.posix)).toBe('src/__tests__/a.ts')
  })
})
