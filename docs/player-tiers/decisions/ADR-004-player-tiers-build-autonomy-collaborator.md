---
adr: 004
title: Player Tiers Milestones 1-3 are built at collaborator autonomy, above the handoff's assistant ceiling
date: 2026-11-18
status: accepted
owner: DimosGougousis
supersedes: none
domains: [flow, governance, autonomy, player-tiers, factory]
applies_to: ["pipeline/active/player-tiers/FactoryHandoff.md", "player-tiers-app: Milestones 1-3"]
review_by: 2027-05-18
ai_generated: true
---

# ADR-004: Player Tiers Milestones 1-3 are built at collaborator autonomy, above the handoff's assistant ceiling

## Context

`pipeline/active/player-tiers/FactoryHandoff.md` set `autonomy_ceiling: assistant` (AI plans and drafts; people write, review and merge code). It took the repository ceiling `collaborator` from `governance/flow-readiness-profile.md` and lowered it one level, because the build handles minors' personal data, Stripe payments and email to parents.

On 2026-11-18 the owner asked the AI to build Basic ("Player level 1") and every coach interaction: Milestones 1, 2 and 3 of `ImplementationPlan.md`. Under `assistant` the AI may not write that code.

The handoff and the readiness profile both say a ceiling is raised only through a new assessment and an ADR, and they name raising the ceiling for one initiative as an anti-pattern. This ADR is that decision record. It is an owner-approved exception with a fixed scope, not a new readiness level.

## Decision

For Milestones 1-3 only, the AI builds `player-tiers-app` at `collaborator` autonomy. The AI writes code and tests on feature branches, test-first, and every change reaches `main` only through a pull request the owner reviews and merges. Milestones 4-6 (billing, Premium data, production configuration) stay at `assistant` unless a later ADR or a `/flow-readiness` reassessment says otherwise.

## Alternatives Considered

- **Option A: stay at assistant.** The AI drafts code in chat and people write it into the repository. It keeps the ceiling, but every task needs a human to transcribe it.
- **Option B: pause and run `/flow-readiness`.** This is the procedure-correct route to a new ceiling, but it delays the build by a full assessment.
- **Option C (chosen): a scoped exception at collaborator, by ADR.** It is limited to milestones that hold no payments and no production data, and it keeps human review on every merge.

## Consequences

**Positive:**

- The Basic tier and the coach loop can be built and tested now.
- Every change still passes a human-reviewed PR.

**Negative / costs:**

- This is the "raise the ceiling for one initiative" pattern the handoff warns about. The mitigation is the narrow scope and the review date below.

**Guardrails for the exception:**

- Milestones 1-3 only. No Stripe keys, no payment code, no production data or real personal data. Tests use synthetic accounts, and email goes through a fake `Mailer`.
- Feature branches only. The AI never merges into `main` in `player-tiers-app`, and pushes to it only once: the bootstrap commit that creates the repository (README and `.gitignore`, no code), so pull requests have a base branch.
- The safeguarding rules (GR-07, GR-08, GR-09, GR-11) are implemented test-first, and their tests must pass before any PR is opened.
- The exception lapses when Milestone 3 is merged, or on `review_by`, whichever comes first.

## Evidence

- `pipeline/active/player-tiers/FactoryHandoff.md` (the ceiling `assistant`, and why).
- `governance/flow-readiness-profile.md` (the ceiling `collaborator`, and the rule for raising it).
- The owner's choice in this session, 2026-11-18: "Raise to collaborator via ADR".

## Linked Artifacts

- Handoff: `pipeline/active/player-tiers/FactoryHandoff.md`
- Plan: `pipeline/active/player-tiers/ImplementationPlan.md` (Milestones 1-3)
- Memory index row: `engineering/memory/INDEX.md`
