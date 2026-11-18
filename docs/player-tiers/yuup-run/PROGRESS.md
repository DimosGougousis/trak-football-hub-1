# Progress: yuup-2026-11-18-player-tiers

## Goal
Turn the Monetizing Athletic Progression deck into an implementable tier spec: the recommended features per tier (Basic, Standard, Premium) and the mandatory Coach-to-Player connections the platform must establish
Output: pipeline/active/yuup-2026-11-18-player-tiers/player-tiers-spec.md

## Tried
- research (research): delivered
- spec (process-designer): delivered
- critique (critique): delivered REVISE
- critique (critique): delivered PASS
- critique (critique): delivered PASS
- revision round 1 on spec: GR-11 and CP-08: device data never writes attributes; GR-01 test covers it; Mark spec-invented tier splits (rec.) in matrix Deck ref; CP-03 safeguard: proof visible to parent by default, no private submission, video proof consent

## Known
- AC-1 [verified] Every feature the deck names appears as a matrix row citing its slide
- AC-2 [verified] The matrix has >= 15 rows with a value for all three tiers, and each tier has its own section
- AC-3 [verified] >= 6 mandatory Coach-Player connections, each with id, direction, data, trigger, tiers and safeguard
- AC-4 [verified] Every link in the spec resolves
- AC-5 [judgement] The deck's guardrails become enforceable rules, the deck's inconsistencies (price, decoy vs discount, missing coach actor) are resolved with a recommendation, and the connections are justified by tier features that depend on them

## Next
- none

## Never
- Write only player-tiers-spec.md (process-designer) and research.md (research); edit no other file
- Feature matrix table header is exactly: | Feature | Deck ref | Basic | Standard | Premium |
- Connections table header is exactly: | ID | Connection | Direction | Data | Trigger | Tiers | Safeguard |
- No pay-to-win: no tier may let money buy XP, Coach Coins, attribute points or badges (deck S8)
- Players are minors: every connection names its safeguard (consent, visibility, no private 1:1 adult-minor channel)
- Recommendations beyond the deck are marked as such and cite research.md
