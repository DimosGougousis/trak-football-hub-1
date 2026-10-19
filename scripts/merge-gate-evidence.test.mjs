import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findTestedMerge } from './merge-gate-evidence.mjs'

function fixture() {
  const repository = 'synthetic/trak'
  const sha = 'main-sha'
  const tree = 'tested-tree'
  const pr = { number: 12, merged_at: '2026-10-19', merge_commit_sha: sha, base: { ref: 'main' }, head: { sha: 'head-sha' } }
  const run = { id: 42, run_attempt: 2, event: 'pull_request', head_sha: pr.head.sha, repository: { full_name: repository }, path: '.github/workflows/ci.yml', html_url: 'https://github.com/synthetic/trak/actions/runs/42' }
  const job = { name: 'test', conclusion: 'success' }
  const artifact = { id: 7, name: 'merge-gate-proof-42-2', expired: false, size_in_bytes: 400 }
  const proof = { repository, pullRequest: 12, head: pr.head.sha, tree, runId: 42, attempt: 2 }
  const options = {
    repository, sha, tree,
    api: async path => {
      if (path.endsWith('/pulls')) return [pr]
      if (path.includes('/workflows/')) return { workflow_runs: [run] }
      if (path.includes('/jobs?')) { assert.match(path, /\/attempts\/2\/jobs/); return { jobs: [job] } }
      if (path.includes('/artifacts?')) return { artifacts: [artifact] }
      throw new Error('Unexpected GitHub request')
    },
    readProof: async () => proof,
  }
  return { options, pr, run, job, artifact, proof }
}

test('reuses a passed final PR for identical contents despite a different merge commit SHA', async () => {
  const f = fixture()
  assert.deepEqual(await findTestedMerge(f.options), { pr: 12, run: f.run.html_url })
})

for (const [name, alter] of [
  ['untested main contents', f => { f.options.tree = 'different-tree' }],
  ['failed tests', f => { f.job.conclusion = 'failure' }],
  ['skipped tests', f => { f.job.conclusion = 'skipped' }],
  ['old attempt evidence', f => { f.proof.attempt = 1 }],
  ['different PR', f => { f.proof.pullRequest = 99 }],
  ['different head', f => { f.proof.head = 'other-head' }],
  ['different run', f => { f.proof.runId = 99 }],
  ['fork run', f => { f.run.repository.full_name = 'someone/fork' }],
  ['branch push evidence', f => { f.run.event = 'push' }],
  ['wrong workflow', f => { f.run.path = '.github/workflows/other.yml' }],
  ['expired proof', f => { f.artifact.expired = true }],
  ['oversized proof', f => { f.artifact.size_in_bytes = 2_000_000 }],
  ['unmerged PR', f => { f.pr.merged_at = null }],
  ['wrong merge target', f => { f.pr.base.ref = 'develop' }],
  ['different merged commit', f => { f.pr.merge_commit_sha = 'other-main' }],
]) test(`blocks deployment with ${name}`, async () => {
  const f = fixture(); alter(f)
  await assert.rejects(findTestedMerge(f.options), /Deployment blocked/)
})

test('an API error blocks deployment rather than accepting absent evidence', async () => {
  const f = fixture(); f.options.api = async () => { throw new Error('GitHub unavailable') }
  await assert.rejects(findTestedMerge(f.options), /GitHub unavailable/)
})
