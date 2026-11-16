# Testing strategy (draft)

Status: working draft for [TRAK-471](https://linear.app/trak-football/issue/TRAK-471), from the 15 Nov team meeting. Makis, Tarek and Imad review.

## Where we are

- The merge gate runs the production build and the bundle credential check only, since 15 Nov ([merge-gate.md](merge-gate.md)). A green gate says nothing about lint, types, unit, use-case, database or browser tests.
- The old gate, with its Playwright configurations and specs, is frozen in [archive/ci-full-gate-2026-11-15](../../archive/ci-full-gate-2026-11-15/README.md), which says how to put it back.
- Why it was cut: every PR waited on the whole suite (child login, coach assessment, layout checks) whatever it changed. Cutting browser specs one by one was tried and dropped (TRAK-468, #637): it lost the consent, guardian invitation, child login and G7 checks without shortening the gate.
- Unit tests can carry a story tag on line 1, for example `// @story J5` (TRAK-467, #636). `npm run test:story -- J5` runs one story.

## The direction

A PR proves its own acceptance criteria, and nothing else is rerun on every merge.

1. Each PR defines test cases for its own acceptance criteria only. The agent drafts them from the problem the PR solves, not from the history of the area.
2. Agents never generate, keep or delete old test cases on their own. Cleanup happens only when a person asks for it.
3. Layout and dimension checks (the desktop spacing Imad found) get one dedicated PR that fixes them for every screen once, so they stop failing for unrelated changes.

## Not built yet

- Nothing runs a PR's own tests on merge. The gate runs no test, so rule 1 is a convention until a check reads the PR's criteria and runs only those tests.
- Nothing protects migrations before they reach production. Deploy still pushes pending migrations to the live database, and the database replay and the RLS and privilege suites no longer run first. Run them locally for any PR that adds a migration (`npm run test:db`).
- The J1 to J8 and G1 to G7 journeys have no always-on coverage. Required scope for the first real-child pilot is unchanged ([PILOT-INDEX](../use-cases/PILOT-INDEX.md)).

## Open questions for Makis

1. How does a PR declare its acceptance criteria so a check can find and run its tests: the PR description, a label, or a tagged test file?
2. Should the full suite run on a schedule (nightly on main, reported but not blocking) as a safety net?
3. Do migrations get their own gate, or is a local run before merge enough?
4. What counts as a story, if story tags stay: the J and G codes only, or J and G plus named streams?
