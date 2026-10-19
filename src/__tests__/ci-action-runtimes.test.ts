import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// GitHub forces Node 20 actions onto Node 24 and warns on every run
// (deprecated 19 Sep 2025). Each entry is the first major whose action.yml
// declares `using: node24` (or composite). An action missing here fails the
// test, so a new one is checked before it is added; Dependabot proposes the
// later majors.
const firstNode24Major: Record<string, number> = {
  'actions/checkout': 5,
  'actions/setup-node': 5,
  'actions/upload-artifact': 6,
  'actions/github-script': 8,
  'supabase/setup-cli': 2,
}

const dir = '.github/workflows'
const uses = readdirSync(dir)
  .filter(file => /\.ya?ml$/.test(file))
  .flatMap(file => {
    const workflow = parse(readFileSync(`${dir}/${file}`, 'utf8'))
    return Object.values(workflow.jobs as Record<string, { steps?: { uses?: string }[] }>)
      .flatMap(job => job.steps ?? [])
      .flatMap(step => (step.uses ? [`${file}: ${step.uses}`] : []))
  })

describe('GitHub Actions runtimes', () => {
  it('finds the workflow steps it checks', () => {
    expect(uses.length).toBeGreaterThan(0)
  })

  it.each(uses)('%s runs on Node 24', entry => {
    const [, action, ref] = entry.match(/: ([^@]+)@v(\d+)/) ?? []
    expect(action, `${entry} must be pinned to a major tag (@vN)`).toBeDefined()
    expect(firstNode24Major[action], `${action} is not in firstNode24Major`).toBeDefined()
    expect(Number(ref)).toBeGreaterThanOrEqual(firstNode24Major[action])
  })
})
