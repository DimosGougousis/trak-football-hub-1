#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  QUESTIONS_PATH,
  hashUseCase,
  loadRegistry,
  readLock,
  writeLock,
} from './uc-registry.mjs'

const args = process.argv.slice(2)
const stage = (args.find(a => a.startsWith('--stage=')) ?? '--stage=commit').split('=')[1]
const writeLockMode = args.includes('--write-lock')

const TESTS_ROOT = resolve('tests/usecases')
const failures = []
// Use-case ids that must be escalated (a question appended) if the run ends
// up blocked. Populated only via failFor() — see its doc comment for which
// kinds of failures qualify.
const escalationIds = new Set()

function fail(message) {
  failures.push(message)
  console.error(`  ✗ ${message}`)
}

// Like fail(), but also marks `id` as needing a durable OPEN-QUESTIONS.md
// entry if the commit ends up blocked. OPEN-QUESTIONS.md is a
// product-owner-facing log — every entry asks a human to pick one of three
// options about what a use case's spec should say, so only use failFor()
// for failures that genuinely raise such a question for a specific use
// case: lock-check tamper (spec text changed without a spec_version bump),
// an enforced use case with no test file, and enforced test-run failures.
// Registry *schema* bugs (duplicate id, missing required field) are
// developer mistakes with no PO decision to make — those call fail()
// directly so they still block the commit without polluting the log.
function failFor(id, message) {
  escalationIds.add(id)
  fail(message)
}

function findTestFiles() {
  const found = new Map()
  if (!existsSync(TESTS_ROOT)) return found
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      // Documented convention: UC-<ID>.<slug>.test.tsx (or .test.ts).
      const match = entry.name.match(/^(UC-[A-Z]\d{2})\.[A-Za-z0-9-]+\.test\.tsx?$/)
      if (!match) continue
      const list = found.get(match[1]) ?? []
      list.push(full)
      found.set(match[1], list)
    }
  }
  walk(TESTS_ROOT)
  return found
}

const registry = loadRegistry()

if (writeLockMode) {
  writeLock(registry)
  console.log('registry.lock.json written.')
  process.exit(0)
}

const tests = findTestFiles()

// --- 1. Registry integrity -------------------------------------------------
console.log('Registry integrity')
const seen = new Set()
for (const uc of registry.use_cases) {
  // Duplicate ids and missing required fields are registry *schema* bugs —
  // a developer mistake, not a product decision. None of the PO's three
  // OPEN-QUESTIONS.md options ("spec stands", "spec changes", "spec
  // ambiguous") apply, so these block the commit via plain fail() but must
  // never escalate to a question. Duplicate ids also make `uc` an unsafe
  // key to escalate under: which of the two would even own that entry?
  if (seen.has(uc.id)) fail(`Duplicate use-case id ${uc.id}`)
  seen.add(uc.id)
  for (const field of ['actor', 'title', 'requirement', 'status', 'given', 'when', 'then', 'spec_version', 'source']) {
    if (uc[field] === undefined || uc[field] === null || uc[field] === '') {
      fail(`${uc.id} is missing required field "${field}"`)
    }
  }
  if (uc.status === 'enforced' && !tests.has(uc.id)) {
    // Unlike the two checks above, this one genuinely implicates a specific
    // use case in a state a PO could plausibly weigh in on (e.g. is this
    // still meant to be enforced?), so it does escalate.
    failFor(uc.id, `${uc.id} is enforced but has no test file under tests/usecases/`)
  }
}
for (const id of tests.keys()) {
  if (!seen.has(id)) fail(`Test file names ${id}, which is not in the registry`)
}
const debt = registry.use_cases.filter(uc => uc.status === 'pending' && !tests.has(uc.id))
if (debt.length) {
  console.log(`  ${debt.length} pending use case(s) with no test yet — coverage debt, not blocking`)
}

// --- 2. Lock check ---------------------------------------------------------
console.log('Lock check')
const lock = readLock()
if (!lock) {
  console.log('  no lock file yet — run: node scripts/uc-check.mjs --write-lock')
} else {
  for (const uc of registry.use_cases) {
    const previous = lock[uc.id]
    if (!previous) continue
    const changed = previous.hash !== hashUseCase(uc)
    if (changed && previous.spec_version === uc.spec_version) {
      failFor(
        uc.id,
        `${uc.id} spec text changed but spec_version is still ${uc.spec_version}.\n` +
        `      You are editing the product owner's words. Either revert, or have\n` +
        `      the PO bump spec_version and add a changelog entry.`,
      )
    }
  }
}

// --- 3 & 4. Run the tests --------------------------------------------------
function runVitest(files) {
  if (files.length === 0) return true
  try {
    execFileSync('npx', ['vitest', 'run', ...files], { stdio: 'inherit', shell: true })
    return true
  } catch {
    return false
  }
}

// Only use cases that actually contributed a test file to the enforced run —
// an enforced use case with no test file is already reported separately
// above ("is enforced but has no test file"), and must not be double-counted
// here as if its (nonexistent) test failed.
const enforcedUseCases = registry.use_cases.filter(uc => uc.status === 'enforced' && tests.has(uc.id))
const enforcedFiles = enforcedUseCases.flatMap(uc => tests.get(uc.id))

const pendingFiles = registry.use_cases
  .filter(uc => uc.status === 'pending')
  .flatMap(uc => tests.get(uc.id) ?? [])

console.log(`Enforced use-case tests (${enforcedFiles.length} file(s))`)
const enforcedPassed = runVitest(enforcedFiles)
if (!enforcedPassed) {
  // Attribute the failure to every enforced use case whose test file was
  // part of this run — we don't parse vitest's output to figure out which
  // file(s) actually failed, we escalate all of them. This block is the
  // reason the whole mechanism exists: a real enforced-test failure must
  // never go unescalated.
  for (const uc of enforcedUseCases) {
    failFor(uc.id, `${uc.id}: enforced use-case test failed`)
  }
}

if (pendingFiles.length) {
  console.log(`Pending use-case tests (${pendingFiles.length} file(s)) — reporting only`)
  const passed = runVitest(pendingFiles)
  if (passed) {
    console.log('  All pending use-case tests PASS — flip them to enforced in registry.yaml')
  }
}

// --- Escalation ------------------------------------------------------------
function alreadyOpen(id) {
  if (!existsSync(QUESTIONS_PATH)) return false
  const text = readFileSync(QUESTIONS_PATH, 'utf8')
  // Match against the section's header line only (the "## Q-..." line), not
  // the whole body — otherwise an id merely mentioned in another question's
  // prose (e.g. "add UC-P04 to the registry") is mistaken for an existing
  // OPEN question about that id.
  const section = text.split('\n## ').find(s => {
    const headerLine = s.slice(0, s.indexOf('\n') === -1 ? s.length : s.indexOf('\n'))
    return headerLine.includes(id)
  })
  return Boolean(section && /Status: OPEN/.test(section))
}

if (failures.length) {
  // escalationIds already reflects the intended scoping (see failFor()'s
  // doc comment): lock-check tamper and "enforced with no test file" are
  // recorded regardless of the use case's status, enforced-test-run
  // failures only for use cases that are actually `enforced`, and registry
  // schema bugs (duplicate id / missing field) never end up in this set at
  // all — so no additional status filter is applied here.
  const failing = registry.use_cases.filter(uc => escalationIds.has(uc.id))
  const date = new Date().toISOString().slice(0, 10)
  for (const uc of failing) {
    if (alreadyOpen(uc.id)) continue
    appendFileSync(
      QUESTIONS_PATH,
      [
        '',
        `## Q-${date}-${uc.id} · ${uc.id} · ${uc.title ?? '(missing title)'}`,
        `Raised: ${date} · commit blocked · ${uc.requirement ?? '(missing requirement)'}`,
        `Spec (v${uc.spec_version ?? '?'}) says:`,
        ...(uc.then ?? []).map(t => `  THEN ${t}`),
        '',
        'PO decision needed — one of:',
        '  [ ] Spec stands -> code bug, fix the code, no registry change',
        '  [ ] Spec changes -> bump spec_version, add changelog entry, dev updates test',
        '  [ ] Spec ambiguous -> rewrite given/when/then, bump spec_version',
        'Status: OPEN',
        '',
      ].join('\n'),
    )
    console.error(`  → question appended to docs/use-cases/OPEN-QUESTIONS.md for ${uc.id}`)
  }
  console.error(`\n${failures.length} problem(s). Commit blocked.`)
  process.exit(1)
}

console.log(`\nOK — ${enforcedFiles.length} enforced, ${debt.length} pending without tests. Stage: ${stage}.`)
process.exit(0)
