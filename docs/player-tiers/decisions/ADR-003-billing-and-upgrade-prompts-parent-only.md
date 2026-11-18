---
adr: 003
title: Prices, billing and upgrade prompts live only in the parent account
date: 2026-11-18
status: accepted
owner: DimosGougousis
supersedes: none
domains: [product, pricing, youth-sports, player-tiers, billing, safeguarding]
applies_to: ["pipeline/active/player-tiers/**", "player-tiers-app: src/main/java/com/academy/tiers/billing/**", "player-tiers-app: player app UI"]
review_by: 2027-11-18
ai_generated: true
---

# ADR-003: Prices, billing and upgrade prompts live only in the parent account

## Context

The player is a minor and uses the app. The parent pays (deck S2). The deck times the upgrade prompt to the child's first Skill Tree milestone, the moment of highest emotion (S12). It also says the child should experience only the sport, not the transaction, and that parent financial data and upgrade nudges are kept separate from the player's UI (S13).

The Software Factory needs one rule for where billing may appear, so that no future screen, prompt or in-app purchase reaches the child.

## Decision

Prices, checkout, subscription state and upgrade prompts appear only in the parent web account. The child's milestone may trigger an upgrade prompt, but it is delivered to the parent only. The player app has no billing screens, no prices and no in-app purchase flow, and a player token is refused on every billing endpoint.

## Alternatives Considered

- **Option A: in-app purchase in the player app** (the app-store standard). It has the least friction. Rejected because it puts the transaction in front of the child and lets a child start a purchase.
- **Option B: show the prompt to the child with a "ask your parent" message.** This is common in kids' apps. Rejected because it turns the child into the sales channel (S13).
- **Option C (chosen): billing on the parent web account only.** The parent decides with full information, the child sees only the sport, and Stripe on the web avoids app-store purchase flows in a child's app.

## Consequences

**Positive:**

- The child never sees a price or a nudge to pay. Trust in the academy and the app is preserved.
- Billing is concentrated in one surface, which keeps compliance and audit simple.
- Conversion still uses the S12 milestone, because the parent receives the prompt at that moment.

**Negative / costs:**

- Conversion takes an extra step: the parent has to open email or the web account.
- With direct coach onboarding (REQ-001 as amended), a player can be active before any parent subscribes. Open question OQ-8 covers what follows.

**Neutral / follow-ups:**

- The factory enforces this with `FinancialSiloTest.playerTokenOnBillingEndpointsReturns403`. That test walks every `/player/**` endpoint looking for price fields. `UpgradePromptTest` checks for exactly one prompt, sent to the parent (Milestone 4).
- An academy bundle (S10) bills the academy, not the child, so it complies.

## Evidence

- Deck S2, S12 and S13, transcribed in `pipeline/active/yuup-2026-11-18-player-tiers/deck-extract.md`.
- Spec decision D5 and guardrail GR-06 in `pipeline/active/yuup-2026-11-18-player-tiers/player-tiers-spec.md`.
- Approved in `ProposedSolution.md` by the owner, 2026-11-18.

## Linked Artifacts

- Requirements: `pipeline/active/player-tiers/ProductRequirements.md` (REQ-005)
- Proposed solution: `pipeline/active/player-tiers/ProposedSolution.md` (Decisions: Billing surface)
- Implementation plan: `pipeline/active/player-tiers/plans/2026-11-18-milestone-4.md`
- Memory index row: `engineering/memory/INDEX.md`
