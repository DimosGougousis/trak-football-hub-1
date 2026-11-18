---
name: player-tiers
handed_off: 2026-11-18
owner: Dimos Gougousis
reversibility: irreversible
autonomy_ceiling: assistant
expected_delivery: 2027-05-17
outcome_review_after_days: 60
---

# Factory Handoff: Player Tiers

Product Office stops here (ADR-001). The Software Factory builds, verifies and releases from this package.

## Package

- `ProductRequirements.md`: the success metric, the kill criteria and requirements REQ-001 to REQ-005. REQ-001 was amended on 2026-11-18: a verified coach onboards players directly.
- `CEOApproval.md`: the decision is go, with Hold Scope (10/20).
- `ProposedSolution.md`: the approved solution, a modular monolith. Its diagrams are in `diagrams/`.
- `ImplementationPlan.md`: 6 milestones and the Nyquist coverage map. The per-milestone TDD plans are in `plans/`.

## Why these settings

- **Reversibility: irreversible.** The build takes money through Stripe and stores personal data about minors. It also sends external email to parents.
- **Autonomy ceiling: assistant.** The readiness profile sets `collaborator` (`governance/flow-readiness-profile.md`). It is lowered one level because the build handles PII, which here is minors' data. The factory's AI may plan and draft. People write the code, review it and merge it. Raising this needs a new readiness assessment and an ADR. **Exception:** [ADR-004](decisions/ADR-004-player-tiers-build-autonomy-collaborator.md) lets Milestones 1-3 be built at `collaborator`. The AI writes code on feature branches, and every change reaches `main` through a PR the owner reviews and merges. [ADR-005](decisions/ADR-005-player-tiers-billing-autonomy-collaborator.md) does the same for Milestone 4, with Stripe test mode only. Milestones 5-6 stay at `assistant`.
- **Expected delivery: 2027-05-17.** That is two weeks before the 2027-06-01 launch, which leaves time for the Milestone 6 rehearsal in staging and the Basic-only fallback.
- **Outcome review: 60 days after release.** This matches the metric's 60-day window and the kill check.

## Open before Milestone 5 or 6 can close

- **Answered 2026-11-18:**
  - OQ-1: the academy is in Greece (GDPR, consent age 15).
  - OQ-7: the players are 15, and the academy has approved use of the app.
  - OQ-8: the player is always onboarded with Basic, and the academy onboards every parent.
  - OQ-9: the academy curates the YouTube video links and their multiple-choice tests in parallel. The build assumes they are ready.
  - Wearables: Whoop or Fitbit.
  - Federation coach-check requirements: approved.
- **Still to check before production:** each wearable vendor's minimum-age terms for 15-year-olds.

## Success Metric and Kill Criteria

- **Metric:** Share of rostered players who log at least 2 drills in a calendar week (weekly active players)
- **Current value:** 0% (no app in use today)
- **Target:** 60% of the partner academy roster
- **Time window:** 60 days after launch (launch 2027-06-01)
- **Data source:** App drill-log events joined to the academy roster, weekly
- **Metrics anchor:** analytics/metrics.md#weekly-active-players
- **Guardrail:** `premium-share` (Premium accounts ÷ active parent accounts), defined in `ProposedSolution.md`
- **Kill condition:** weekly active players stay below half the target at day 60
- **Kill threshold:** fewer than 30% of rostered players log 2 or more drills a week
- **Kill decision date:** 2027-07-31

## What the Factory Sends Back

- `DeliveryReport.md` in this folder at release, with:
  - a `released:` date
  - a Results row for every REQ ID (REQ-001 to REQ-005)
  - what shipped, what changed from the plan, and known issues. Say whether Premium launched in full or fell back to Basic only.
- The factory's own working files (build status, decision log, coverage report) go in `factory/`

## Outcome Review

`/outcome-review player-tiers` runs 60 days after `released`. `python scripts/check-loop.py` warns when it is overdue.
