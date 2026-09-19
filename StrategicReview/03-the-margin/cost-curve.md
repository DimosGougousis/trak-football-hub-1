# 03 — The Margin: Cost Curve

*Session: 19 September 2026. **Every figure here is an illustrative assumption, not a measurement.**
Billing is out of scope for September 25 ([pilot plan](../../docs/pilot-readiness-2026-09-25.md)),
so this is the packaging, pricing and cost design for after the pilot.*

---

## Packaging decision

| Leader | Filler | Killer | Killer usage % | Bundle or add-on |
|---|---|---|---|---|
| **Player passport and coach-signed record** | **Agent-built session records** | **Trial application pack** (ages 16–18) | **~15%** of players · **~1%** of AI cost | **Add-on** |

**Leader — the feature they come for.** A believable record of the player: the coach's assessments
and feedback, the record they build, the parent view, and the passport — including the transfer
passport a player takes to a new club. Covered by the base fee.

**Filler — nice add, bumps ARPU.** After each game or training the coach confirms attendance, gives
feedback and sets areas to work on; the agent turns that into a session record, fuses it with the
player's data and updates the passport. Each session record is the metered unit. Revenue grows with
the work the agent does.

**Killer — sell separately or die.** A structured profile and passport bundle for players applying
to academy trials or scholarships. A minority need it; bundling it would raise the price for every
player to serve roughly one in seven; and a school will not pay for a trial-application service for
every pupil. Sold separately, per pack.

### The 70% rule, applied

> *If Killer usage is >70%, it is probably an add-on.*

- **On the Killer, it doesn't trigger.** The trial pack is used by ~15% of players and drives ~1% of
  AI cost. It is an add-on for a segment reason, not a cost reason — the rule is a sufficient
  condition for an add-on, not a necessary one.
- **On the Filler, it does.** Session records are produced for every active player and carry ~89%
  of AI cost. That is why the Filler is the metered unit. **The 70% rule catches the Filler, not
  the Killer** — the cost to watch is the feature every player uses, not the one few buy.

### One change from the earlier pricing recommendation

The **transfer passport pack** was previously priced at 20 credits. It moves into the Leader,
covered by the base fee. The [threat board](../02-the-moat/threat-board.md) found player-owned
portability to be one of only two things no attacker takes; charging for it at the moment a player
changes club paywalls the moat at the exact moment it is meant to work. Bundling it costs about
**€0.09 per player-season** on average.

### Pricing rules this model assumes

1. **Billing is per player; the guardian pays, not the player.** Players are 13–18, so a player's
   bill is paid by a guardian — or by an academy or school on the player's behalf. Metered usage
   stops at a cap the payer sets — default the expected bill, $25 a month — hard stop, no automatic
   top-up.
2. **Paying never changes the record.** No payment touches bands, assessments or coach notes.
3. **No child loses core development help because a family can't pay.** This price puts the rule
   under pressure — see condition 2 in the Decision Note.
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

**Hybrid fits because Trak does two kinds of work.** The base fee pays for what the buyer comes for —
the passport and the coach-signed record, the parent view — which is steady and shouldn't vary with
use. The metered unit pays for the agent's work: after each game or training the coach confirms
attendance and gives feedback and areas to work on, and the agent builds the session record, fuses
the data and updates the passport. The unit is named after that outcome, not a model call, and
metered revenue rises with the same work that drives ~89% of AI cost — usage pays for itself.

**Maximize fits the position.** Skimming needs a brand that already signals premium; penetration
needs a cost advantage and volume. Trak has neither yet, and Veo and Spond can bundle something
similar for free. Maximize prices for the value of a player's development record in its current
niche.

**Billing is per player:** $30 base + 50 session records at $0.50 = **$55 per player per month.**

**Conditions this decision depends on — test before launch:**

1. **Willingness to pay.** $55 a month is $550 over a 10-month season — more than the ~€500 a year
   parents pay the academy ([REQUIREMENTS.md](../../REQUIREMENTS.md)). Nobody has paid Trak anything
   yet.
2. **Who pays the base.** If guardians pay it, a child whose family can't pay has no record, which
   breaks pricing rule 3. If the academy pays it, $300 a season is about 60% of its own fee per
   player.
3. **Every unit starts with a coach input.** A 15-player squad at ~16 sessions a month is ~240 coach
   inputs a month. No input, no record, no revenue — the week-4 coach drop-off kill criterion is now
   a revenue risk too.
4. **The agent compiles; it doesn't judge.** The evaluative words come from the coach. If the agent
   writes its own feedback, that is AI feedback to a child, and each record needs a coach's approval
   before the player sees it (T2).
5. **The unit estimate.** A player with one match and three trainings a week has ~16 sessions a
   month; 50 records means about three per session. At one per session, revenue is ~$38.

---

## Cost model

### Assumptions

| Input | Value |
|---|---|
| Billing unit | Per player per month |
| Base fee | $30 |
| Metered unit | $0.50 per agent-built session record |
| Units per player per month | 50 — the pricing block's estimate |
| Trial application pack | $4, sold separately; 15% of players buy one a season |
| Currency | $ and € at parity — the unit costs are too rough for exchange rates to matter |
| Season | 10 months |
| Squad | 15 players, 1 coach |
| Coach cadence | 4 Touchline drafts per player per month; 8 session plans per coach per month |

**Unit AI cost per delivered output** — to be replaced with measured cost per invocation:

| Workflow | Role | Unit cost |
|---|---|---:|
| Touchline assessment draft | Leader | $0.02 |
| Coach session plan (`coach-assistant`) | Leader | $0.05 |
| Transfer passport pack | Leader | $0.30 |
| Agent-built session record | Filler | $0.02 |
| Trial application pack | Killer | $0.60 |

The session record is priced as a single model call. The agent's real run — read the coach's input
and the player's data, write the record, update the passport — makes several calls and will cost
more; the curve below shows how much headroom there is.

### Per player per month

| Output | Count | AI cost |
|---|---:|---:|
| Touchline drafts | 4.00 | $0.080 |
| Coach session plans (share) | 0.53 | $0.027 |
| Transfer passport packs (average) | 0.03 | $0.009 |
| Agent-built session records | 50.00 | $1.000 |
| Trial application packs (average) | 0.015 | $0.009 |
| **AI cost** | **54.58** | **$1.125** |

Revenue: $30 base + $25 metered + $0.06 trial packs (average) = **$55.06**. AI cost is **2.0%** of
revenue.

### Where the AI cost goes

| Role | AI cost per player per month | Share of AI cost |
|---|---:|---:|
| Leader | $0.116 | 10.3% |
| Filler | $1.000 | 88.9% |
| Killer | $0.009 | 0.8% |

---

## The curve

The base fee is **flat**; metered revenue **rises** with every session record; AI cost **rises**
with every output. Because the metered unit carries ~89% of AI cost, revenue and cost move together.

How far AI cost can rise, at 100 players with the $2.00 non-AI placeholder from the
[margin calculator](margin-calculator.md):

| AI cost multiplier | ×1 | ×5 | ×10 |
|---|---:|---:|---:|
| AI cost per player | $1.12 | $5.62 | $11.25 |
| Gross margin | 94.3% | 86.2% | 75.9% |

AI cost would have to rise about **13×** before margin at 100 players falls below 70%.

Three consequences:

1. **At this price, margin is not the constraint — willingness to pay is.** See the Decision Note.
2. **Hold the metered price above unit cost ÷ 0.30.** $0.50 keeps a 70% margin on each unit until a
   session record costs $0.15 — 7.5× the single-call assumption. The agent's measured cost per
   record is the number that matters.
3. **Keep agentic work out of the base fee.** The base covers the Leader; any workflow whose cost
   grows with use belongs in the metered unit, or it erodes the flat fee.

---

## Not in this model

- **Non-AI costs:** hosting (Supabase, Vercel), monitoring (Sentry), email (Resend), support. The
  [margin calculator](margin-calculator.md) adds them as a placeholder — $2.00 of $55.06 per player
  at 100 players.
- **Payment processing:** card fees on each monthly charge.
- **The AI gateway.** Three edge functions still route through Lovable's gateway on
  `LOVABLE_API_KEY`; per-run cost depends on its pricing until they are re-pointed.
- **Coach time.** Not a cash cost, but no unit can be billed without it — ~240 coach inputs a month
  for a 15-player squad.

## Measure first

1. **Cost per agent-built session record** — tokens and $ per record, across the whole multi-step
   run. Then `coach-assistant`, `parse-schedule` and `player-feedback`.
2. **Real units per player** — sessions a month, and how many records each session produces.
3. **Willingness to pay** — what academy directors and guardians would pay per player per month for
   the passport.
4. **Trial pack uptake** among 16–18 year olds, which confirms or kills the Killer.
