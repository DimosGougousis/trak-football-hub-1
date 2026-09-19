# 03 — The Margin: Cost Curve

*Session: 19 September 2026. **Every figure here is an illustrative assumption, not a measurement.**
Billing is out of scope for September 25 ([pilot plan](../../docs/pilot-readiness-2026-09-25.md)),
so this is the packaging and cost design for after the pilot.*

---

## Packaging decision

| Leader | Filler | Killer | Killer usage % | Bundle or add-on |
|---|---|---|---|---|
| **Coach-signed player record** | **AI match debrief & weekly training plan** | **Trial application pack** (ages 16–18) | **~15%** of players · **~4%** of AI cost | **Add-on** |

**Leader — the feature they come for.** An academy or school buys a believable record for every
child in its care: a Touchline-drafted, six-category assessment the coach signs, the record it
builds, the parent view, and the passport — including the transfer passport a player takes to a new
club. Always in the access price. Never metered, never charged to the family.

**Filler — nice add, bumps ARPU.** Debriefs and training plans the player starts themselves. A
monthly credit allowance per player is included in access; beyond it, credits are paid by the
guardian. The revenue lift comes from the heaviest users.

**Killer — sell separately or die.** A structured profile and passport bundle for players applying
to academy trials or scholarships. A minority need it; bundling it would raise the access price for
every child to serve roughly one in seven; and a school will not pay for a trial-application service
for every pupil. Sold separately, in credits.

### The 70% rule, applied

> *If Killer usage is >70%, it is probably an add-on.*

- **On the Killer, it doesn't trigger.** The trial pack is used by ~15% of players and drives ~4% of
  AI cost. It is an add-on for a segment reason, not a cost reason — the rule is a sufficient
  condition for an add-on, not a necessary one.
- **On the Filler, it does.** Debriefs and plans are used by ~75% of players and drive ~50% of AI
  cost. That is why the Filler is the metered piece: the allowance is bundled, the overage is an
  add-on. **The 70% rule catches the Filler, not the Killer** — the cost to watch is the feature
  most players use, not the one few buy.

### One change from the earlier pricing recommendation

The **transfer passport pack** was previously priced at 20 credits. It moves into the Leader. The
[threat board](../02-the-moat/threat-board.md) found player-owned portability to be one of only two
things no attacker takes; charging for it at the moment a player changes club paywalls the moat at
the exact moment it is meant to work. Bundling it costs about **€0.09 per player-season** on
average.

### Pricing rules this model assumes

1. **The guardian pays, not the player.** Players are 13–18. Usage is charged to the player's
   account, paid by a guardian within a cap the guardian sets — default €10 a month, hard stop, no
   automatic top-up.
2. **Paying never changes the record.** No paid workflow touches bands, assessments or coach notes.
3. **No child loses core development help because a family can't pay.** Institutions can buy a
   pooled credit fund; schools that refuse per-student charges get access plus pooled credits only.
4. **Each workflow is a consent purpose** the guardian has switched on (P2).
5. **Offers go to the guardian, never to the child.**

---

## Pricing model

### Pricing Strategy

- Strategy posture: Maximize
- Pricing model: Hybrid (base + usage)
- Unit of work metered: Summarise Game, Trainings and feedback per game and training.
- Base fee ($/month): 30
- Price per unit: $0.5
- Estimated units/user/month: 50
- Implied revenue/user/month: $55.00

### Decision Note

Why this pricing structure fits the buyer and the value delivered:

*To be written.*

---

## Cost model

### Assumptions

| Input | Value |
|---|---|
| Season | 10 months |
| Squad | 15 players, 1 coach |
| Access price | **€30 per player-season** — about 6% of the ~€500 a year academy fee in [REQUIREMENTS.md](../../REQUIREMENTS.md) |
| Included allowance | 20 credits per player per month |
| Credit price | €0.10 — debrief 2 credits, training plan 3, trial pack 40 (€4.00) |
| Coach cadence | 4 Touchline drafts per player per month; 8 session plans per coach per month |

**Unit AI cost per delivered output** — to be replaced with measured cost per invocation:

| Workflow | Role | Unit cost |
|---|---|---:|
| Touchline assessment draft | Leader | €0.02 |
| Coach session plan (`coach-assistant`) | Leader | €0.05 |
| Transfer passport pack | Leader | €0.30 |
| Match debrief (`player-feedback`) | Filler | €0.02 |
| Weekly training plan | Filler | €0.03 |
| Trial application pack | Killer | €0.60 |

**Usage segments:**

| Segment | Share | Player AI use per month |
|---|---:|---|
| Light | 25% | None |
| Typical | 60% | 3 debriefs, 2 training plans (12 of 20 credits) |
| Heavy | 15% | 4 debriefs, 4 training plans (all 20 credits), plus 150 paid credits across the season |

Transfer pack: 30% of players, once a season. Trial pack: 15% of players, once a season.

### Per player-season

| | Typical player | Heavy player |
|---|---:|---:|
| Leader — Touchline drafts (40 × €0.02) | €0.80 | €0.80 |
| Leader — session planner share (€4.00 ÷ 15) | €0.27 | €0.27 |
| Leader — transfer passport pack | — | €0.30 |
| Filler — within allowance | €1.20 | €2.00 |
| Filler — paid overage | — | €1.50 |
| Killer — trial application pack | — | €0.60 |
| **AI cost** | **€2.27** | **€5.47** |
| Revenue — access (institution) | €30.00 | €30.00 |
| Revenue — overage credits (guardian) | — | €15.00 |
| Revenue — trial pack (guardian) | — | €4.00 |
| **AI cost as % of revenue** | **7.6%** | **11.2%** |

### Cohort of 100 players — where the AI cost goes

| Role | Used by | AI cost per season | Share of AI cost |
|---|---:|---:|---:|
| Leader | 100% | €116.00 | 46.5% |
| Filler | 75% | €124.50 | 49.9% |
| Killer | 15% | €9.00 | 3.6% |
| **Total** | | **€249.50** | **100%** |

Revenue for the cohort: €3,000 access + €225 overage + €60 trial packs = **€3,285**. AI cost is
**7.6%** of revenue.

---

## The curve

Access revenue is **flat** per player; AI cost **rises** with every output. The allowance is the
hinge: below it, the institution's flat fee absorbs the cost; above it, guardian credits pay for it.

The model holds at single-call costs. Agentic workflows run several model calls per output, so the
real question is how many times more expensive each output is than assumed above:

| AI cost vs. the €30 access price | ×1 | ×5 | ×10 |
|---|---:|---:|---:|
| Typical player | €2.27 · 8% | €11.35 · 38% | €22.70 · 76% |
| Heavy player, allowance capped (institution-borne) | €3.37 · 11% | €16.85 · 56% | €33.70 · **112%** |
| Heavy player, if everything were bundled | €5.47 · 18% | €27.35 · 91% | €54.70 · **182%** |

**At roughly 4× the assumed unit cost, AI spend alone takes cohort gross margin below 70%** at
these prices. At 10×, even a capped heavy player costs more than the €30 the institution pays for
them, and an uncapped one loses €24.70 each.

Three consequences:

1. **The allowance is the margin control, not a courtesy.** It must shrink, or access must reprice,
   as measured unit cost rises.
2. **Set credit prices from measured cost:** each workflow's price ≥ its unit cost ÷ 0.30, to hold
   a 70% margin. At today's assumptions the debrief sits at 90%; at 10× it sits at zero.
3. **Never ship an agentic workflow uncapped inside the access price.** The bottom row is what
   "unlimited" costs.

---

## Not in this model

- **Non-AI costs:** hosting (Supabase, Vercel), monitoring (Sentry), email (Resend), support. The
  [margin calculator](margin-calculator.md) adds them as a placeholder — at pilot scale they
  outweigh AI cost eight to one.
- **Payment processing.** A fixed per-transaction fee takes a larger share of a €5 top-up than of a
  €30 one — consider a higher minimum top-up.
- **The AI gateway.** Three edge functions still route through Lovable's gateway on
  `LOVABLE_API_KEY`; per-run cost depends on its pricing until they are re-pointed.
- **Coach time.** Not a cash cost, but the real constraint — the Filler's debriefs need coach
  approval before a child sees them (T2).

## Measure first

1. **Cost per invocation** in `coach-assistant`, `parse-schedule` and `player-feedback` — tokens and
   euros per delivered output. Replace the unit-cost table.
2. **The real usage split** across light, typical and heavy players in the pilot.
3. **Allowance hit rate** — the share of players who reach 20 credits in a month.
4. **Trial pack uptake** among 16–18 year olds, which confirms or kills the Killer.
