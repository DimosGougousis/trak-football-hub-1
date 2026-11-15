# Full merge gate, as it stood on 15 November 2026

A frozen copy taken from main at commit `46cd9335`, the day the merge gate was
cut down to the build and the bundle credential check. Nothing here runs: the
workflows are outside `.github/workflows`, and lint and the test runners do
not look in this folder. Edit the live files, never these copies.

## What is here

| Copy | Live file it was taken from |
|---|---|
| `.github/workflows/ci.yml` | The gate with its four parts: `static`, `unit`, `database`, `browser` |
| `.github/workflows/merge-base.yml` | Unchanged on that day; kept so the CI configuration is complete |
| `playwright.config.ts`, `playwright.pilot.config.ts`, `playwright.g2-profile.config.ts` | The three Playwright configurations |
| `e2e/` | Every Playwright spec and helper |
| `src/__tests__/release-workflow.test.ts` | The test that guarded the four-part gate |

The live Playwright configurations and `e2e/` were left in place, so
`npm run test:browser` still works locally. Only `ci.yml` and
`release-workflow.test.ts` were changed.

## Putting the full gate back

To restore the gate alone, copy two files back and open a PR:

```bash
cp archive/ci-full-gate-2026-11-15/.github/workflows/ci.yml .github/workflows/ci.yml
```

```bash
cp archive/ci-full-gate-2026-11-15/src/__tests__/release-workflow.test.ts src/__tests__/release-workflow.test.ts
```

Then return `docs/release/merge-gate.md` and the "Local work and checks"
section of `AGENTS.md` to describing the full suite.

Work merged while the gate was reduced was never run against these tests, so
expect failures on the first full run and fix them in that PR. Specs added to
`e2e/` after this date are not in the copy; keep the live `e2e/` and the live
Playwright configurations if they are newer than these.

The branch protection settings did not change: the required checks were and
remain `test` and `Base branch still reaches main`.
