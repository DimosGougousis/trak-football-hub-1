# Margin Calculator, Module 3

*Session: 19 September 2026. Two runs of the same calculator: the workshop's worked example, kept as
provided, and Trak's own numbers taken from the [cost curve](cost-curve.md). Trak's figures are
illustrative assumptions, not measurements.*

---

## Workshop example

*As provided. Arithmetic checked — every figure is correct.*

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

## Trak

"User" is one player; the cohort is the 100 players modelled in the cost curve. A request is one
**delivered AI output** — a Touchline draft, a debrief, a pack. An agentic output may make several
model calls; the cost multipliers in the stress test stand for that.

### Inputs
- Avg requests/user/month: **9.68**
- Blended cost/request: **€0.0258**
- Revenue/user/month: **€3.29** — €3.00 access paid by the institution + €0.29 guardian credits,
  cohort average
- Non-AI COGS/user/month: **€2.00** — *placeholder:* €200 a month of platform cost (hosting,
  database, monitoring, email) spread over 100 players

### Current Margin
- AI COGS/user: **€0.25**
- Total COGS/user: **€2.25**
- Gross margin: **31.6% (€1.04/user)**

### Stress Test

Revenue held flat in every row, as in the workshop example. With metered overage, part of a usage
increase would come back as guardian credits, so the usage rows are conservative.

| Scenario | AI COGS | Non-AI COGS | Margin |
|----------|--------:|------------:|--------|
| Pilot, 100 players | €0.25 | €2.00 | 31.6% (€1.04) |
| 3x Cost | €0.75 | €2.00 | 16.4% (€0.54) |
| 2x Usage | €0.50 | €2.00 | 24.0% (€0.79) |
| 10x Cost — agentic | €2.50 | €2.00 | **−36.7% (−€1.21)** |
| 1,000 players | €0.25 | €0.20 | 86.3% (€2.84) |
| 1,000 players, 3x Cost | €0.75 | €0.20 | 71.1% (€2.34) |
| 1,000 players, 10x Cost | €2.50 | €0.20 | 18.0% (€0.59) |

### What the calculator shows

1. **At pilot scale, fixed platform cost sinks the margin — not AI.** Non-AI COGS is eight times the
   AI COGS at 100 players. Trak earns about 24× less per user per month than the workshop example,
   so fixed costs that disappear into an $80 price dominate a €3.29 one.
2. **Scale fixes the fixed costs; it doesn't fix AI cost.** Going from 100 to 1,000 players takes
   margin from 31.6% to 86.3%. At 10× AI cost, 1,000 players still leaves only 18%.
3. **The 70% line needs about 270 paying players** at base AI cost and a €200 monthly platform
   bill. Below that, no pricing of the AI layer rescues the margin.

### Where the inputs come from

Per player per season, cohort average, from the [cost curve](cost-curve.md):

| Output | Count | AI cost |
|---|---:|---:|
| Touchline drafts | 40.00 | €0.80 |
| Coach session plans (share) | 5.33 | €0.27 |
| Match debriefs | 28.50 | €0.57 |
| Weekly training plans | 22.50 | €0.68 |
| Transfer passport packs | 0.30 | €0.09 |
| Trial application packs | 0.15 | €0.09 |
| **Total** | **96.78** | **€2.50** |

Over a 10-month season that is 9.68 requests and €0.25 of AI cost per player per month — a blended
€0.0258 per request. Revenue: €32.85 per player-season (€30 access + €2.85 guardian credits) =
€3.29 a month.

### Replace first

1. **Non-AI COGS.** The €200 a month is a placeholder. Replace it with the real monthly invoices for
   hosting, database, monitoring and email, plus payment-processing fees on guardian top-ups. It
   decides the margin more than any other input.
2. **Blended cost per request.** Log tokens and euros per delivered output in `coach-assistant`,
   `parse-schedule` and `player-feedback`.
3. **Requests per player.** The pilot's real split across light, typical and heavy players.

**Breakeven check:** paying players needed for a 70% margin = monthly platform cost ÷
(0.30 × revenue per player − AI COGS per player) = €200 ÷ (€0.987 − €0.25) ≈ **270 players**.
