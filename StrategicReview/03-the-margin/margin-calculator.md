# Margin Calculator, Module 3

*Session: 19 September 2026. Two runs of the same calculator: the workshop's worked example, kept as
provided, and Trak's own numbers taken from the [cost curve](cost-curve.md). Trak's figures are
illustrative assumptions, not measurements.*

---

## Workshop example

*As provided — these are the calculator's "Typical SaaS + AI" preset. Arithmetic checked: every
figure is correct.*

### Inputs
- Avg requests/user/month: 500
- Blended cost/request: $0.02
- Revenue/user/month: $80
- Non-AI COGS/user/month: $5

### Current Margin
- AI COGS/user: $10.00
- Total COGS/user: $15.00
- Gross margin: 81.3% ($65.00/user)

### Stress Test
| Scenario | AI COGS | Margin |
|----------|---------|--------|
| 3x Cost  | $30.00 | 56.3% ($45.00) |
| 2x Usage | $20.00 | 68.8% ($55.00) |

---

## How the calculator works

Rules worked out on 19 September by setting inputs on the course's M3 calculator and reading the
outputs; every rule below matched every probe exactly. Described in our own terms.

**Inputs, per user per month:** requests (R), blended cost per request (C — tokens plus infrastructure
overhead), revenue (P), non-AI COGS (O).

| Output | Formula |
|---|---|
| AI COGS | R × C |
| Total COGS | R × C + O |
| Gross margin | (P − total COGS) ÷ P |
| Gross profit | P − total COGS |

**Stress test.** Revenue and non-AI COGS stay flat. *3× cost shock* multiplies AI COGS by 3; *2×
heavy users* multiplies it by 2.

**Verdict bands.** Both verdicts use the same cut-offs:

| | ≥ 60% | 40–60% | < 40% |
|---|---|---|---|
| Current margin | Healthy | Caution | Danger |
| Stress verdict — judged on the 3× margin | Survives both | Survives, but thin | Fails |

The tool's wording for the bottom stress band says margins go *negative*, but it fires whenever the
3× margin is below 40%, even while still positive.

**Scenario lab.** Three sliders — cost multiplier (0.25–5×), volume multiplier (0.5–10×), and
**cascading**: the share of requests routed to a cheap model (0–95%).

> AI COGS = R × C × cost multiplier × volume multiplier × (1 − 0.9 × cascading share)

The cheap model is priced at **10% of the main model**, and it rises with the cost multiplier too.
Non-AI COGS does not move with volume.

---

## Trak

"User" is one player — the billing unit. A request is one **delivered AI output**: a Touchline draft,
an agent-built session record, a pack. Pricing and derivation are in the [cost curve](cost-curve.md):
$30 base + $0.50 per session record, 50 a month. $ and € at parity.

### Inputs
- Avg requests/user/month: **54.58**
- Blended cost/request: **$0.0206**
- Revenue/user/month: **$55.06** — $30 base + $25 metered (50 × $0.50) + $0.06 trial packs, average
- Non-AI COGS/user/month: **$2.00** — *placeholder:* $200 a month of platform cost (hosting,
  database, monitoring, email) spread over 100 players

### Current Margin
- AI COGS/user: **$1.12**
- Total COGS/user: **$3.12**
- Gross margin: **94.3% ($51.94/user)**

### Stress Test

Revenue held flat in every row, as the calculator does. With metering, more usage also brings more
revenue, so the usage row is conservative. Computed from unrounded inputs.

| Scenario | AI COGS | Non-AI COGS | Margin | Verdict |
|----------|--------:|------------:|--------|---------|
| Pilot, 100 players | $1.12 | $2.00 | 94.3% ($51.94) | Healthy |
| 3x Cost | $3.37 | $2.00 | 90.2% ($49.69) | Healthy |
| 2x Usage | $2.25 | $2.00 | 92.3% ($50.81) | Healthy |
| 10x Cost — agentic | $11.25 | $2.00 | 75.9% ($41.81) | Healthy |
| 1,000 players | $1.12 | $0.20 | 97.6% ($53.74) | Healthy |
| 1,000 players, 10x Cost | $11.25 | $0.20 | 79.2% ($43.61) | Healthy |

**Calculator stress verdict**, judged on the 3× margin (90.2%): **survives both** scenarios.

### Units: the input that moves revenue

| Session records per player per month | Revenue | Margin |
|---|---:|---:|
| 16 — one per session | $38.06 | 93.6% |
| 32 — two per session | $46.06 | 94.0% |
| 50 — the pricing block's estimate | $55.06 | 94.3% |

A player with one match and three trainings a week has about 16 sessions a month.

### What the calculator shows

1. **At $55 per player, margin is not the constraint.** 94.3% at pilot scale, and Healthy even at
   10× AI cost.
2. **About 13 paying players cover a $200 monthly platform bill** at a 70% margin.
3. **The unit estimate moves revenue, not margin:** $38–$55 a month across 16–50 records, with
   margin between 93.6% and 94.3%.
4. **The risk has moved to willingness to pay** — $550 a season against the ~€500 a year parents pay
   the academy. See the Decision Note in the [cost curve](cost-curve.md).

### Scenario lab: routing to a cheaper model

At this price routing isn't needed to stay Healthy. At 100 players and 10× AI cost, margin is 75.9%
without routing; sending 70% of requests to the cheap model lifts it to 88.8%. The session record
carries ~89% of AI cost, so it is where routing would matter — once measured cost shows whether a
cheaper model can build the record without losing quality.

### Replace first

1. **Cost per agent-built session record.** The multi-step run — tokens and $ per record.
2. **Session records per player.** The pilot's real count per month.
3. **Non-AI COGS.** Replace the $200 a month placeholder with real invoices for hosting, database,
   monitoring and email, plus card fees on each monthly charge.

**Breakeven check:** paying players needed for a 70% margin = monthly platform cost ÷
(0.30 × revenue per player − AI COGS per player) = $200 ÷ ($16.52 − $1.12) ≈ **13 players**.
