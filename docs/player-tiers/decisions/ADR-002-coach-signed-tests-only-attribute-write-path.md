---
adr: 002
title: Coach-signed tests are the only path that changes Player Card attributes, on every tier
date: 2026-11-18
status: accepted
owner: DimosGougousis
supersedes: none
domains: [product, pricing, youth-sports, player-tiers, progression]
applies_to: ["pipeline/active/player-tiers/**", "player-tiers-app: src/main/java/com/academy/tiers/progression/**"]
review_by: 2027-11-18
ai_generated: true
---

# ADR-002: Coach-signed tests are the only path that changes Player Card attributes, on every tier

## Context

Player Tiers sells Basic ($9) and Premium ($29.99) to parents of academy players. The deck's core rule is that parents cannot buy progression (no pay-to-win, deck S8). It also says attributes such as Pace, Dribbling and Tactical Awareness rise only through real-world academy testing (S3).

Premium adds data sources that Basic lacks: wearable sync and AI video. In the first critique round of YUUP run `yuup-2026-11-18-player-tiers`, a draft rule let device-synced data change attributes. That gave Premium a second, paid route to higher attributes. Every structural check passed, and only the review caught it.

## Decision

A verified, rostered coach signing a test result is the only thing that writes Player Card attributes, on every tier and for every future tier. Self-logged drills earn XP and Skill Tree progress only. Premium-only data (wearables, AI video) feeds trends and informs the coach's next test, but it never writes attributes, XP or Coach Coins.

## Alternatives Considered

- **Option A: device data also writes attributes.** It is the most automated. Rejected because Premium alone would then have a paid path to progression, which breaks deck S8.
- **Option B: self-logged drills write attributes, with caps.** It needs no coach. Rejected because manual entry is the easiest input to cheat (research.md §4), and parents could not trust the Player Card.
- **Option C (chosen): only coach-signed tests write attributes.** It is one auditable write path that is the same on every tier.

## Consequences

**Positive:**

- Money cannot buy progression on any tier, now or later.
- The Player Card means "a coach measured this", which is the parent's proof of value (deck S2, S14).
- There is one write path to audit and one place to test.

**Negative / costs:**

- Attributes move only as often as the academy runs tests. Between tests, players see change only in XP and trends.
- Coaches must sign results in the app, so this depends on CP-02 adoption.

**Neutral / follow-ups:**

- The factory enforces this with `ProgressionTest.premiumDrillAndWearableSyncChangeNoAttributes` and an ArchUnit test, `ArchitectureTest`. Only `TestResultService` may write `player_attribute` (Milestone 2).
- `entitlements.yaml` must keep `rules.progression_write_by_entitlement: false`. The loader rejects any other value (Milestone 4).
- Any new tier, SKU, discount or data source must state how it complies with this ADR.

## Evidence

- Deck S3 and S8, transcribed in `pipeline/active/yuup-2026-11-18-player-tiers/deck-extract.md`.
- Critique round 1 REVISE (blocker: GR-11 allowed device data to write attributes), then PASS 90 after the fix: `governance/runs/yuup-2026-11-18-player-tiers.jsonl`.
- Learning-log row, 2026-11-18: structural checks prove shape, not substance.

## Linked Artifacts

- Requirements: `pipeline/active/player-tiers/ProductRequirements.md` (REQ-002)
- Proposed solution: `pipeline/active/player-tiers/ProposedSolution.md` (Decisions: Attribute writes)
- Implementation plan: `pipeline/active/player-tiers/plans/2026-11-18-milestone-2.md`
- Tier spec: `pipeline/active/yuup-2026-11-18-player-tiers/player-tiers-spec.md` (GR-01, GR-11, CP-02)
- Memory index row: `engineering/memory/INDEX.md`
