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
  it('runs the full gate only for final PRs, never branch pushes or drafts', () => {
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

// The gate's checks run side by side (Makis and Tarek, 14 Nov): four parts, then `test` gathers them. Branch
// protection, the merge proof and Deploy all still look for the one job named `test`.
const PARTS = ['static', 'unit', 'database', 'browser']
type Step = { name?: string; run?: string; uses?: string; env?: Record<string, string> }
const steps = (job: string): Step[] => workflow.jobs[job].steps
describe('the merge gate runs its parts side by side', () => {
  it('runs every part only for a final PR, as the single job did', () => {
    const pr = { event: 'pull_request', ref: 'refs/pull/25/merge', backend: 'skipped' }
    for (const job of PARTS) {
      expect(permits(job, pr)).toBe(true)
      expect(permits(job, { ...pr, draft: true })).toBe(false)
      expect(permits(job)).toBe(false)
    }
  })

  it('still runs every check the single job ran', () => {
    const ran = PARTS.flatMap(job => steps(job).map(step => step.run ?? '')).join('\n')
    for (const command of ['node scripts/check-delivery-policy.mjs', 'npm run lint', 'npm run typecheck',
      'node --test scripts/merge-gate-evidence.test.mjs scripts/check-push-credentials.test.mjs', 'npm run test:consent-timezones',
      'npm run test:harness', 'npm run uc:check', 'npm run test:db\n', 'npm run test:db -- --parent-upgrade-review',
      'npm run test:db -- --coach-departure-review', 'npm run test:db -- --academy-upgrade-review', 'npm run test:db -- --assessment-upgrade-review',
      'npm run test:db:academy-history', 'npm run test:db:runner', 'npm run test:db:concurrency', 'npm run test:db:query-plans',
      'npm run test:db:native -- --academy-upgrade-review', 'npm run test:db:convergence', 'npm run build', 'npm run check:bundle',
      'npx playwright install --with-deps chromium']) expect(`${ran}\n`).toContain(command)
    // The unit and browser tests are split by file across machines; together the shards run every file once.
    const shards = (job: string) => workflow.jobs[job].strategy.matrix.shard.length
    expect(steps('unit').map(step => step.run)).toContain(`npm test -- --shard=\${{ matrix.shard }}/${shards('unit')}`)
    expect(steps('browser').map(step => step.run)).toContain(`npx playwright test --config playwright.pilot.config.ts --shard=\${{ matrix.shard }}/${shards('browser')}`)
    for (const job of ['unit', 'browser']) {
      expect(workflow.jobs[job].strategy.matrix.shard).toEqual(Array.from({ length: shards(job) }, (_, i) => i + 1))
      expect(workflow.jobs[job].strategy['fail-fast']).toBe(false)
    }
  })

  // GitHub counts a SKIPPED required check as passed. Without always(), one failed part would skip `test` and let
  // a broken PR merge. So `test` always runs for a final PR, and fails unless every part succeeded.
  it.each([
    ['success', 'success', 'success', 'success', 0],
    ['failure', 'success', 'success', 'success', 1],
    ['success', 'failure', 'success', 'success', 1],
    ['success', 'success', 'cancelled', 'success', 1],
    ['success', 'success', 'success', 'skipped', 1],
    ['success', 'success', 'success', '', 1],
  ])('test is red unless every part passed: %s %s %s %s', (STATIC, UNIT, DATABASE, BROWSER, status) => {
    expect(workflow.jobs.test.needs).toEqual(PARTS)
    expect(workflow.jobs.test.if).toMatch(/^always\(\) && /)
    const gate = steps('test')[0]
    expect(gate.env).toEqual(Object.fromEntries(PARTS.map(job => [job.toUpperCase(), `\${{ needs.${job}.result }}`])))
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', gate.run!], { encoding: 'utf8', env: { PATH: '', STATIC, UNIT, DATABASE, BROWSER } })
    expect(result.status).toBe(status)
  })

  it('records the merge proof last, on a checkout no test or build has touched', () => {
    const names = steps('test').map(step => step.name ?? step.uses)
    expect(names.indexOf('Record tested contents')).toBeGreaterThan(0)
    expect(steps('test').filter(step => step.run).map(step => step.run)).toHaveLength(2)
    expect(steps('test').at(-1)!.uses).toMatch(/^actions\/upload-artifact@/)
  })
})
