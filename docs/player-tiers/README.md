# Player Tiers

Basic and Premium plans for players and every coach-to-player interaction: coach verification, onboarding, coach-signed tests, drills and XP, messaging with parents copied, the parent feed, billing and the upgrade prompt. The work was planned in Product Office and moved here on 2026-11-19. The backend built from it is in [`services/player-tiers-app/`](../../services/player-tiers-app/README.md).

Paths written in backticks inside these documents, such as `pipeline/active/...` or `analytics/metrics.md`, name the places they had in Product Office. The documents are kept as written. The table below gives each one's location here.

| Document | What it holds |
|---|---|
| [ProductRequirements.md](ProductRequirements.md) | The approved requirements REQ-001 to REQ-005, the success metric, kill criteria and the open questions (all answered) |
| [CEOApproval.md](CEOApproval.md) | The go decision with Hold Scope (10/20) and its risks |
| [ProposedSolution.md](ProposedSolution.md) | The approved design: API contracts, edge cases, decisions and [diagrams](diagrams/) |
| [ImplementationPlan.md](ImplementationPlan.md) | Six milestones, each requirement mapped to tests, and the per-milestone TDD plans in [plans/](plans/) |
| [FactoryHandoff.md](FactoryHandoff.md) | The handoff terms: irreversible, an autonomy ceiling of `assistant`, delivery on 2027-05-17, and the outcome review |
| [decisions/](decisions/) | ADR-002 (only coach-signed tests change attributes), ADR-003 (billing parent-only), ADR-004 and ADR-005 (the autonomy exceptions for Milestones 1-4) |
| [metrics-and-learning.md](metrics-and-learning.md) | The `weekly-active-players` and `premium-share` metrics, the run's learning, and KD-010 |
| [yuup-run/](yuup-run/decisions.md) | The original YUUP run: the deck transcript, competitor and safeguarding research, the tier spec, its contract, checker and run trace |

## Build status

| Milestone | Scope | State |
|---|---|---|
| 1-3 | Coach verification, onboarding, progression, messaging and the parent feed | Built and merged in the former `player-tiers-app` repository (PR 1) |
| 4 | Entitlements, Stripe billing in test mode, Skill Tree sign-off and the upgrade prompt | Built and reviewed; was open as PR 2 there when it moved here |
| 5-6 | Premium wearables (Whoop or Fitbit), the YouTube video library and launch configuration | Not started; autonomy `assistant` |
