import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
const upstream = 'kostasanastasioubusiness-lang/trak-football-hub'
const fork = 'imadd23x/trak-football-hub'
interface Scenario {
  repository?: string
  event?: string
  ref?: string
  headRepository?: string
  tests?: string
  backend?: string
  credentials?: string
  evidence?: string
  draft?: boolean
}
function permits(job: string, scenario: Scenario = {}) {
  const github = {
    repository: scenario.repository ?? upstream,
    event_name: scenario.event ?? 'push',
    ref: scenario.ref ?? 'refs/heads/main',
    event: { pull_request: { draft: scenario.draft ?? false, head: { repo: { full_name: scenario.headRepository ?? upstream } } } },
  }
  const needs = {
    test: { result: scenario.tests ?? 'success' },
    'tested-main': { result: scenario.evidence ?? 'success' },
    supabase: { result: scenario.backend ?? 'success' },
    'vercel-credentials': { outputs: { configured: scenario.credentials ?? 'true' } },
  }
  // Evaluate the actual checked-in GitHub expression, not a duplicate gate.
  const expression = workflow.jobs[job].if.replaceAll('needs.vercel-credentials', "needs['vercel-credentials']").replaceAll('needs.tested-main', "needs['tested-main']")
  return new Function('github', 'needs', 'always', `return (${expression})`)(github, needs, () => true)
}
describe('release workflow regression gates', () => {
  it.each([0, 23])('previews pending migrations before applying and stops when preview exits %i', previewStatus => {
    const push = workflow.jobs.supabase.steps.find((step: { name: string }) => step.name === 'Push migrations').run
    // Execute the checked-in step under GitHub's fail-fast shell semantics.
    // The shell function captures CLI calls; no executable or database is used.
    const stub = `supabase() {
      printf '%s\\n' "$*"
      case "$*" in *--dry-run*) return ${previewStatus} ;; esac
      return 0
    }\n`
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', stub + push], {
      encoding: 'utf8', env: { PATH: '', DB_URL: 'postgresql://synthetic.invalid/rehearsal' },
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(previewStatus)
    const calls = result.stdout.trim().split('\n')
    expect(calls).toHaveLength(previewStatus ? 1 : 2)
    for (const call of calls) {
      expect(call).toContain('db push --db-url postgresql://synthetic.invalid/rehearsal')
      expect(call).toContain('--include-all')
    }
    expect(calls[0]).toContain('--dry-run')
    if (!previewStatus) expect(calls[1]).not.toContain('--dry-run')
  })

  it.each(['vercel-credentials', 'supabase', 'deploy'])('never runs %s from fork main even with credentials', job => {
    expect(permits(job, { repository: fork })).toBe(false)
  })
  it('deploys main using identical tested contents without running the suite again', () => {
    expect(permits('deploy')).toBe(true)
    expect(permits('test')).toBe(false)
    expect(permits('deploy', { tests: 'skipped' })).toBe(true)
    for (const result of ['failure', 'cancelled', 'skipped']) {
      expect(permits('deploy', { evidence: result })).toBe(false)
      expect(permits('supabase', { evidence: result })).toBe(false)
      expect(permits('deploy', { backend: result })).toBe(false)
    }
    expect(permits('deploy', { credentials: 'false' })).toBe(false)
    expect(workflow.jobs.supabase.needs).toEqual(expect.arrayContaining(['tested-main', 'vercel-credentials']))
  })
  it('allows an upstream preview but blocks a fork PR preview and every PR database write', () => {
    const pr = { event: 'pull_request', ref: 'refs/pull/25/merge', backend: 'skipped' }
    expect(permits('deploy', pr)).toBe(true)
    expect(permits('deploy', { ...pr, headRepository: fork })).toBe(false)
    expect(permits('supabase', pr)).toBe(false)
    for (const tests of ['failure', 'cancelled', 'skipped']) expect(permits('deploy', { ...pr, tests })).toBe(false)
  })
  it('runs the gate only for final PRs, never branch pushes or drafts', () => {
    expect(workflow.on.push.branches).toEqual(['main'])
    expect(workflow.on.pull_request.types).toEqual(expect.arrayContaining(['ready_for_review', 'synchronize', 'converted_to_draft']))
    const pr = { event: 'pull_request', ref: 'refs/pull/25/merge', backend: 'skipped' }
    expect(permits('test', pr)).toBe(true)
    expect(permits('test', { ...pr, draft: true })).toBe(false)
    expect(permits('deploy', { ...pr, draft: true })).toBe(false)
    expect(permits('test', { ref: 'refs/heads/shared/task' })).toBe(false)
    expect(workflow.concurrency['cancel-in-progress']).toBe("${{ github.event_name == 'pull_request' }}")
    for (const job of PARTS) {
      expect(workflow.jobs[job].steps.find((step: { name: string }) => step.name === 'Install dependencies').run).toBe('npm ci --legacy-peer-deps')
    }
  })
})

// The gate is one part, `build`, then `test` gathers it (15 Nov 2026). Branch protection, the merge proof and
// Deploy all still look for the one job named `test`. archive/ci-full-gate-2026-11-15 holds the four-part gate.
const PARTS = ['build']
type Step = { name?: string; run?: string; uses?: string; env?: Record<string, string> }
const steps = (job: string): Step[] => workflow.jobs[job].steps
describe('the merge gate builds and checks the bundle, nothing else', () => {
  it('runs every part only for a final PR', () => {
    const pr = { event: 'pull_request', ref: 'refs/pull/25/merge', backend: 'skipped' }
    for (const job of PARTS) {
      expect(permits(job, pr)).toBe(true)
      expect(permits(job, { ...pr, draft: true })).toBe(false)
      expect(permits(job)).toBe(false)
    }
  })

  it('builds, then reads the built bundle for secrets, and runs no regression suite', () => {
    const ran = steps('build').filter(step => step.run).map(step => step.run)
    expect(ran).toEqual(['npm ci --legacy-peer-deps', 'npm run build', 'npm run check:bundle'])
    expect(Object.keys(workflow.jobs)).toEqual(['build', 'test', 'tested-main', 'vercel-credentials', 'supabase', 'deploy'])
  })

  // GitHub counts a SKIPPED required check as passed. Without always(), a failed build would skip `test` and let
  // a broken PR merge. So `test` always runs for a final PR, and fails unless the build succeeded.
  it.each([
    ['success', 0],
    ['failure', 1],
    ['cancelled', 1],
    ['skipped', 1],
    ['', 1],
  ])('test is red unless the build passed: %s', (BUILD, status) => {
    expect(workflow.jobs.test.needs).toEqual(PARTS)
    expect(workflow.jobs.test.if).toMatch(/^always\(\) && /)
    const gate = steps('test')[0]
    expect(gate.env).toEqual(Object.fromEntries(PARTS.map(job => [job.toUpperCase(), `\${{ needs.${job}.result }}`])))
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', gate.run!], { encoding: 'utf8', env: { PATH: '', BUILD } })
    expect(result.status).toBe(status)
  })

  it('records the merge proof last, on a checkout no test or build has touched', () => {
    const names = steps('test').map(step => step.name ?? step.uses)
    expect(names.indexOf('Record tested contents')).toBeGreaterThan(0)
    expect(steps('test').filter(step => step.run).map(step => step.run)).toHaveLength(2)
    expect(steps('test').at(-1)!.uses).toMatch(/^actions\/upload-artifact@/)
  })
})
