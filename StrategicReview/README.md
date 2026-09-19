# Strategic Review — Trak Football

Outputs of a strategy workshop run against the Trak codebase and docs on **12 September 2026**, with
the margin module added on 19 September: where Trak places its bet, a working prototype of the most
critical use case, a stress test of whether anything about the business is defensible, and how it
should package and price.

**Read [What has changed since](#what-has-changed-since) first.** The analysis is kept exactly as
delivered, but several facts it rested on have been superseded by the
[September 25 pilot plan](../docs/pilot-readiness-2026-09-25.md).

---

## Contents

Grouped by workshop module. Module 1 is named in the workshop's own material ("your M1 Three-Axis
Scorecard"); the moat exercises follow it in order, each building on the one before. The margin
module uses the workshop's own path, `03-the-margin/cost-curve.md`.

### [01-the-bet/](01-the-bet/)

| File | Question it answers |
|---|---|
| [strategy.md](01-the-bet/strategy.md) | What is the strategy in three sentences, and how do we pitch Trak to a CEO as an athlete passport? |
| [three-axis-diagnostic.md](01-the-bet/three-axis-diagnostic.md) | How defensible is Trak on moat, data and platform exposure — and what are the top 10 vulnerabilities? |
| [prototype.md](01-the-bet/prototype.md) | What did we prototype for the most critical use case, and what claim should the pilot attack? |
| [touchline-prototype.html](01-the-bet/touchline-prototype.html) | The prototype itself. Open in a browser; live version at the link in `prototype.md`. |

### [02-the-moat/](02-the-moat/)

| File | Question it answers |
|---|---|
| [moat-stress-test.md](02-the-moat/moat-stress-test.md) | Which axis is weakest, and who exploits it? |
| [eight-moats.md](02-the-moat/eight-moats.md) | Of the eight classic moats, which is actually available to Trak? |
| [data-flywheel.md](02-the-moat/data-flywheel.md) | Does usage make the product better — and which loop is the vulnerability? |
| [threat-board.md](02-the-moat/threat-board.md) | Who attacks, from where, how fast, and how much value is at risk? |
| [90-day-encroachment-plan.md](02-the-moat/90-day-encroachment-plan.md) | What would the strongest attacker do in 90 days, and how does Trak defend? |

### [03-the-margin/](03-the-margin/)

| File | Question it answers |
|---|---|
| [cost-curve.md](03-the-margin/cost-curve.md) | What do customers come for, what raises revenue per player, what must be sold separately — and where does AI cost break the margin? |
| [margin-calculator.md](03-the-margin/margin-calculator.md) | What is Trak's gross margin per player, and what breaks it — AI cost, usage, or scale? |

`00-Makis` is an existing placeholder in this folder and was left untouched.

---

## Headline findings

- **No moat today.** Nothing scores above 2 / 5 across the eight moats. The M1 diagnostic scored
  Contextual Moat 2, Data Advantage 2, Platform Exposure 3.
- **One defensible position is available: Regulatory × Network** — the only record of a young
  athlete's performance and conduct that a school can lawfully hold and another institution will
  accept. The moat is who accepts the certificate, not the software.
- **The data flywheel scores 5 / 20.** The weakest loop is Correction. The one move: persist
  `source_text`, `drafted_band`, `signed_band` and `coach_id` on every assessment — with the GDPR
  legal basis for model improvement designed in *before* the first row.
- **The sharpest attacker is Veo**: a coach assessment stapled to footage the camera already
  captured, shipped free to an installed base in 6–9 months. Veo's 90-day plan out-bites Trak's
  defence.
- **Touchline — Claude drafts, the coach signs.** The prototype's central idea is that an
  AI-authored assessment destroys believability the same way a self-fabricated one does.
- **Package as Leader / Filler / Killer:** the coach-signed record is what institutions buy; AI
  debriefs and training plans lift revenue per player through metered overage; the trial
  application pack is sold separately. On illustrative costs, AI spend is 7.6% of revenue — and
  breaks the 70% margin line at roughly 4× the assumed unit cost, which agentic workflows can reach.
- **At pilot scale, fixed platform cost sinks the margin — not AI.** On a placeholder €200 a month
  platform bill, gross margin is 31.6% at 100 players and 86.3% at 1,000; the 70% line needs about
  270 paying players. At scale, routing 70% of requests to a model at a tenth of the cost keeps even
  a 10×-cost agentic workload at a healthy 65.8%.

---

## What has changed since

Checked against [docs/pilot-readiness-2026-09-25.md](../docs/pilot-readiness-2026-09-25.md) and
the repository on 19 September 2026. [CLAUDE.md](../CLAUDE.md) now marks `docs/pm/STATE.md` and
`docs/features-outstanding.md` — both used as inputs to this analysis — as historical.

### Superseded

| The analysis assumed | The current plan says | Affects |
|---|---|---|
| Greece first | **UAE first, Greece on the same build** | strategy, threat board |
| No parental-consent capture | Backend-enforced guardian consent below 18 in both countries, with purpose choices and withdrawal (P2); only minimal roster setup before approval | diagnostic #5, eight moats, threat board, 90-day plan |
| No terms or privacy policy | Drafts of terms, privacy policy and an academy agreement are in scope (P8, P9) | same as above |
| Backups never restore-tested | A restore rehearsal with recorded duration is a deliverable (S5) | diagnostic #8 |
| 9 test files for 162 source files | 29 test files for 198 source files, plus a harness suite | diagnostic #8 |
| Character axis as defensible ground | The character module is **explicitly out of scope** for September 25 | moat stress test, eight moats, 90-day plan |

### Confirmed by the team's own decisions

| The analysis concluded | The current plan says |
|---|---|
| The coach must sign before an AI draft counts (Touchline) | AI feedback is invisible to children until a coach approves it (T2, verification U6) |
| Cross-club isolation is deliberate and blocks a data network effect | Cross-academy isolation is a named deliverable (K1, verification U7) |

### Still open

- **No billing and no payer decision.** Billing is explicitly out of scope.
- **No real-child pilot yet.** September 25 is a synthetic-account demonstration; real-child
  admission is a separate gate with its own requirements.
- **GDPR data export** — the portability the passport depends on — does not appear in the
  September 25 scope.
