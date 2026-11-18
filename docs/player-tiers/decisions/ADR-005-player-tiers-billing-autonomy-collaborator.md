---
adr: 005
title: Player Tiers Milestone 4 (entitlements and billing) is built at collaborator autonomy, Stripe test mode only
date: 2026-11-18
status: accepted
owner: DimosGougousis
supersedes: none
domains: [flow, governance, autonomy, player-tiers, factory, billing]
applies_to: ["pipeline/active/player-tiers/FactoryHandoff.md", "player-tiers-app: Milestone 4"]
review_by: 2027-05-18
ai_generated: true
---

# ADR-005: Player Tiers Milestone 4 is built at collaborator autonomy, Stripe test mode only

## Context

ADR-004 let AI build Milestones 1-3 at `collaborator` autonomy. That exception lapsed when Milestone 3 merged on 2026-11-18 ([player-tiers-app#1](https://github.com/DimosGougousis/player-tiers-app/pull/1)).

Milestone 4 adds entitlements, Stripe billing, the parent-only upgrade prompt and the `premium-share` guardrail. The handoff's ceiling stays `assistant` (`pipeline/active/player-tiers/FactoryHandoff.md`) because the build handles money. On 2026-11-18 the owner chose to raise it for Milestone 4 only, by ADR.

## Decision

For Milestone 4 only, the AI builds at `collaborator` autonomy under the same rules as ADR-004:

- It writes code test-first on feature branches.
- It never merges.
- Every change reaches `main` through a PR that the owner reviews.

Because this milestone handles money, billing is limited to **Stripe test mode**. The application refuses to start with a live key.

## Alternatives Considered

- **Option A: stay at assistant.** The AI drafts the code in chat and people write it into the repository.
- **Option B: run `/flow-readiness` first.** It is the right way to change the ceiling durably, but it takes a full assessment.
- **Option C (chosen): a scoped exception for Milestone 4 with test-mode billing.** No real money can move while the AI is the author, and the owner still reviews every merge.

## Consequences

**Guardrails for the exception:**

- **Scope:** Milestone 4 only. Premium data (wearables, the video library) and launch configuration (Milestones 5-6) stay at `assistant`.
- **Test mode only:** no Stripe key, webhook secret or price id is committed. The app refuses a secret key that does not start with `sk_test_`, unless a human sets `tiers.billing.stripe.allow-live-keys=true` in a deployment.
- **No live calls in tests:** tests use a fake Stripe gateway and make no network calls to Stripe.
- **Tests first:** the ADR-003 financial-silo tests must pass before the PR is opened:
  - a player token is refused on every billing endpoint
  - no price, checkout or upgrade data appears in any response a player can fetch
  - the upgrade prompt goes to parents only
- **Lapse:** the exception lapses when Milestone 4 merges, or on `review_by`, whichever comes first.

**Negative / costs:**

- This is a second exception that raises the ceiling for one initiative. Two exceptions in a row are a signal to run `/flow-readiness` for Player Tiers before Milestones 5-6.

## Evidence

- ADR-004 and the merged Milestone 1-3 build: 65 tests, each review finding fixed with a regression test.
- `governance/flow-readiness-profile.md`: the repository ceiling is `collaborator`.
- The owner's choice in this session, 2026-11-18: "Raise for M4 via ADR-005".

## Linked Artifacts

- Handoff: `pipeline/active/player-tiers/FactoryHandoff.md`
- Plan: `pipeline/active/player-tiers/plans/2026-11-18-milestone-4.md`
- Previous exception: `engineering/adr/ADR-004-player-tiers-build-autonomy-collaborator.md`
- Memory index row: `engineering/memory/INDEX.md`
