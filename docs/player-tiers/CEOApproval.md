---
name: player-tiers
decision: go
mode: Hold Scope
reviewed: 2026-11-18
---

# CEO Approval: Player Tiers

## Scoring Matrix

| Dimension | Score | Reasoning |
|---|---|---|
| Market Fit | 3/5 | Demand Reality says the parent segment was validated with academy parents, but no interview notes, LOIs or paying commitments are recorded. This is anecdotal evidence, not documented research. |
| Differentiation | 3/5 | The wedge combines a coach-signed Player Card, no pay-to-win (REQ-002), a safeguarding-first coach link (REQ-001, REQ-003) and a parent ROI view. Competitors cover parts of it (TeamSnap, Techne, CoachNow, Veo), so this is better execution of an existing approach. The coach and academy network is the part that is hard to copy. |
| Feasibility | 2/5 | Shipping Basic and Premium together means AI video quizzes, GPS vest and smart-ball sync, billing and coach verification by 2027-06-01. Compliance is still open: jurisdiction (OQ-1) and whether under-13s are in scope (OQ-7). |
| ROI Timeline | 2/5 | The success metric measures engagement (weekly active players), not revenue. The anti-requirements remove ads, which the deck expected to supply about 70% of Basic's revenue. Launch is at one partner academy, and the AI and wearable build cost comes first. |

**Composite:** 10/20

## Risk Assessment

- **Delivery:** AI video and wearable sync may not be ready for 2027-06-01. If they slip, the Basic + Premium wedge falls back to Basic only.
- **Compliance:** Until jurisdiction and the under-13 question are settled, the consent and coach-verification flows (REQ-001, REQ-004) cannot be finished.
- **Economics:** At $9 with no ads, Basic does not pay for itself, so the case depends on parents upgrading to Premium. No metric tracks the Premium share yet. Add it as a guardrail in `/proposed-solution`.

## Decision

Go, with Hold Scope. Build exactly the Basic + Premium wedge in `ProductRequirements.md`, add nothing, and settle OQ-1 and OQ-7 before the consent design is locked.
