# Player Tiers: metrics and learning

These entries moved here from Product Office on 2026-11-19, along with the rest of the Player Tiers work.

## Metrics

### weekly-active-players

- **Definition:** Share of rostered players who log at least 2 drills in a calendar week
- **Initiative:** [ProductRequirements.md](ProductRequirements.md)
- **Owner:** Dimos Gougousis
- **Data source:** App drill-log events joined to the academy roster, weekly
- **Code:** `services/player-tiers-app/src/main/java/com/academy/tiers/analytics/WeeklyActivePlayersQuery.java`

### premium-share

- **Definition:** Share of an academy's actively rostered players whose subscription is Premium (guardrail for the Basic + Premium economics risk in [CEOApproval.md](CEOApproval.md))
- **Initiative:** [ProductRequirements.md](ProductRequirements.md)
- **Owner:** Dimos Gougousis
- **Data source:** `player_subscription` joined to active `roster_link` rows; changes arrive as `tier_changed` events
- **Code:** `services/player-tiers-app/src/main/java/com/academy/tiers/analytics/PremiumShareQuery.java`

## Learning from the YUUP run

| Date | Source | Surprise | Gap |
|---|---|---|---|
| 2026-11-18 | YUUP run `yuup-2026-11-18-player-tiers` ([yuup-run/](yuup-run/decisions.md)) | (1) The source deck was image-only, so text extraction returned nothing. (2) All four structural checks passed on a spec that still had a pay-to-win path: wearable data, which is Premium-only, could raise Player Card attributes. Only critique caught it. | (1) Intake had no rule for image inputs. (2) Keyword checks prove shape, not substance; judgement criteria must name the invariants critique has to test. |

## Open knowledge debt

| ID | Type | Description | Priority | Due |
|---|---|---|---|---|
| KD-010 | missing | YUUP intake has no step for image-only inputs. The Player Tiers deck had 15 slides, all images, so the orchestrator transcribed them by eye into [yuup-run/deck-extract.md](yuup-run/deck-extract.md), which is unverified, and specialists trusted it as core context. A rule is needed: transcribe image inputs into the workspace, mark the transcript unverified, and have critique spot-check it against the source. | 5 | 2026-12-31 |
