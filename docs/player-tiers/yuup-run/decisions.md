# Decisions — yuup-2026-11-18-player-tiers

**Objective:** Implement the Player Tiers from the *Monetizing Athletic Progression* deck: the recommended features for each tier and the mandatory Coach-to-Player connections.
**Owner:** dimos · **Autonomy:** collaborator (ceiling from `governance/flow-readiness-profile.md`) · **Branch:** `feature/prd-player-tiers`
**Deliverable:** [player-tiers-spec.md](player-tiers-spec.md) · Inputs: [deck-extract.md](deck-extract.md), [research.md](research.md)

## What was done

| # | Task | Agent | Outcome | Verdict |
|---|---|---|---|---|
| 1 | Benchmarks, safeguarding law, coach verification, pricing risk | research | delivered (20 sources, 9 contradictions) | — |
| 2 | Tier spec: matrix, tier sections, connections, guardrails, sequencing | process-designer | delivered | — |
| 3 | Critique round 1 | critique | delivered | REVISE 78 |
| 4 | Revision round 1 (blocker + 2 advisories) | orchestrator | applied | — |
| 5 | Critique round 2 | critique | delivered | PASS 90 |

## Decision log

| Time (UTC) | Event | Decision |
|---|---|---|
| 2026-11-18 | Intake | The deck is image-only, so the orchestrator transcribed it into `deck-extract.md`. No clarifying question was asked: the actor, outcome and source were clear. Intent quality 2 of 3, because the deck has no success metric. |
| 2026-11-18 | Contract | 4 command criteria (`check_spec.py` --trace, --tiers and --connections, plus the link check) and 1 judgement criterion (AC-5). |
| 2026-11-18 | Research | Found that the deck's Basic "hyper-targeted ads" conflict with COPPA and the UK Children's Code. Found that the streak discounts break the $25 decoy. |
| 2026-11-18 | Spec | Premium is $29.99. The streak discount is capped at 15%, with a price floor above Standard. Ads are contextual only for minors. The upgrade prompt goes to the parent only. The coach is defined as a verified, roster-linked adult. The spec designs to the strictest common legal baseline. |
| 2026-11-18 | Critique REVISE | Blocker: GR-11 let device data, which is Premium-only, change attributes. That is pay-to-win. |
| 2026-11-18 | Revision 1 | Only coach-signed tests change attributes, on every tier. Spec-invented tier splits are marked "(rec.)". The CP-03 proof channel is parent-visible by default. Checks were re-run: all exit 0. |
| 2026-11-18 | Critique PASS | Score 90. AC-5 judged met. Two nits remain open (below). |
| 2026-11-18 | Learning | KD-010 was added: intake has no rule for image-only inputs. Logged in the learning log. |

## Open items

- Nit: the "shared, tier-identical rules" wording in GR-01 could be tighter (spec line 97).
- Nit: some Standard cell values have no "(rec.)" mark of their own. The Deck ref column covers them.
- The spec lists open questions OQ-1 to OQ-7. OQ-1 (jurisdiction) and OQ-7 (whether under-13s are in scope) change the consent design the most.
- `research.md` passed critique with a score of 82, on judgement evidence only. That is why the run closed as `PASSED_UNVERIFIED` (rule R4). Three advisories remain open:
  - It overstates the ads conflict. COPPA allows targeted ads to under-13s with verifiable parental consent, and the Children's Code applies only to UK users.
  - It cites Children's Code standard 13, which covers data nudges, not purchase prompts. The spec's D5 repeats this, but it also rests on the deck's own S13 financial silo.
  - It writes the copy-a-parent rule for coach messages as universal. It is sport-specific (SafeSport MAAPP, FA 6.2).
- Next loop step: `/product-requirements player-tiers` to add a success metric and kill criteria.
- No gated actions ran: no spend, no external communications, nothing destructive.
