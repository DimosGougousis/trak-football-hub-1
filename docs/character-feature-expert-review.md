# Trak — Character Feature: Draft Approach for Expert Review

*Rough plan prepared for review by a sports/educational psychologist. Last updated: 2026-06-29.*

## How to use this document

This is our **draft thinking**, not a finished design. We are not psychologists — we've based
this on published frameworks and our experience building a youth football app. We want your
**honest, blunt review**: what's sound, what's risky, what to change, and where we're simply
wrong. Throughout, lines marked **"Review:"** are the specific questions we'd value your input
on, and they're consolidated at the end.

---

## 1. Context

- **Trak** is a football development app. The **coach is the primary user** — they log sessions
  and assess players. Today the **kids are passive**: the app is built for them, but they put
  in no work.
- We want to add a **character-building feature**, delivered to the kids, that (a) gives them an
  active role and (b) gives coaches a view of each player's **behavioural progress alongside
  performance** — "the complete player."
- **Football first**, one age cohort for the pilot. The coach controls delivery; **Trak owns the
  content** (including age-appropriateness).

## 2. Our intended approach

### a. Frameworks we're leaning on
- **TPSR** (Hellison — Teaching Personal and Social Responsibility): 5 levels, self-reflection
  driven, with "transfer" beyond sport as the goal.
- **PCA "ROOTS"** (Rules, Opponents, Officials, Teammates, Self) for sportsmanship.
- **Rugby's codified values** (e.g. World Rugby's Integrity/Respect/Discipline; the age-grade
  "TREDS") as a model for naming and drilling conduct.

> **Review:** Are these the right foundations for character development through youth sport?
> What's missing or outdated? Is there a stronger evidence base we should build on instead?

### b. The value-set (draft)
Six values: **Composure · Respect · Effort · Teamwork · Responsibility · Sportsmanship**, with
"**Transfer**" (carrying behaviour outside sport) as a cross-cutting goal rather than a 7th value.

> **Review:** Are these the right values, the right number, and named in a way that lands with
> children? Would you add, cut, or rename any?

### c. Delivery model — a "learn → apply → act" loop
- **Learn** — short flashcards (what a value looks like in football).
- **Apply** — situational-judgment scenarios (a dilemma; the kid chooses a response and gets
  feedback — never a grade).
- **Act** — a real-world challenge ("at training, do X without being asked"), marked done.

> **Review:** Is this a credible behaviour-change loop for this age group? Does the "act/transfer"
> step need more scaffolding to actually change real behaviour?

### d. Cadence
- A **weekly value theme**; **one short moment per logged session** (triggered when the coach
  logs training/match, so it matches how often they play — not a forced daily task); **optional
  extras**; a **weekly payoff** (recognition/badge). Format rotates so it isn't repetitive.
- **Spiral curriculum:** values repeat across seasons at increasing depth.

> **Review:** Is this dose realistic for behaviour change — too little, too much? Is a
> session-triggered rhythm sensible, or is consistency (e.g. fixed weekly) more important?

### e. Age-appropriateness — Trak's responsibility
The coach should **not** judge difficulty; Trak serves the right level automatically based on the
team's age (which the app already stores). We plan a content matrix:

> **Value × Age band × Tier (the spiral)**

Three developmental bands, with content complexity matched to how children reason about
right/wrong at each stage (our reference points: Piaget's and Kohlberg's stages of moral
development):

| Band | Approx age | How morality is reasoned (our assumption) | Content style |
|---|---|---|---|
| Foundation | ~6–9 | Concrete, rule/authority-based | "The ref is in charge — when the whistle goes, we stop." Simple, short. |
| Development | ~10–13 | Fairness, intent, consequences emerging | Scenario: teammates shout at the ref — what do you do? |
| Youth | ~14–18 | Abstract, identity, principle, leadership | "Your captain is losing it with the ref." "A handball no one saw — own up?" |

> **Review:** Are these bands and age ranges developmentally accurate? Is our mapping of content
> complexity to moral-reasoning stage correct? Are Piaget/Kohlberg the right anchors, or would
> you ground this differently? What concepts are *inappropriate* for the youngest band?

### f. Assessment & progress — deliberately NOT graded
- The kid **self-reflects**; the coach **lightly observes and recognises**. We compare
  self-perception to coach observation as a growth conversation, not a score.
- Progress is shown as **streaks, badges, and demonstrated values** — and as a separate
  "character corner" on the player card. **Never a character score, never a ranking, never a
  deficiency label.**

> **Review:** Is "no grading" the right call? Is self-reflection valid and useful at these ages
> (especially the youngest)? How should we handle the honesty problem — kids rating themselves
> generously or to please the coach?

### g. Motivation & gamification (our biggest worry)
We plan to use badges, streaks, unlocks, and recognition to keep kids engaged.

> **Review:** Does rewarding *good character* with extrinsic rewards risk undermining the
> intrinsic motivation we actually want (the over-justification effect / self-determination
> theory)? How do we make it engaging without crowding out genuine internalisation? Where's the
> line?

### h. Anti-gaming / social desirability
We're aware kids may "perform" sportsmanship for points. Mitigations we're considering: reward
**consistency and real-world action** over one-off taps, weight **coach corroboration**, and use
**no public leaderboard**.

> **Review:** Are these mitigations sufficient? What's the best way to encourage authentic
> behaviour rather than reward-chasing?

### i. Safeguarding & wellbeing
This is children's behavioural data. Scenarios touch on conflict, mistakes, and losing.
Reflections are private to the child and their coach (parents only later, with consent).

> **Review:** Any emotional-safety risks in asking children to reflect on their own behaviour or
> engage with conflict/loss scenarios? Any content red lines? Consent/parental considerations?

## 3. What we will NOT claim
We won't claim the feature "fixes behaviour," reduces aggression, or guarantees outcomes. We want
honest, evidence-aligned positioning.

> **Review:** What can we **credibly** say this does? Where must we stay cautious?

## 4. The questions we most want answered (priority order)

1. Are the **frameworks and value-set** sound and complete?
2. Is the **age-banding** developmentally accurate, and the content-complexity mapping correct?
3. Is **self-reflection + no grading** the right approach for these ages — and how do we keep
   self-report honest?
4. Does **gamification undermine intrinsic motivation**, and how do we avoid that?
5. Are our **anti-gaming** mitigations enough?
6. How do we make **real-world transfer** actually happen?
7. Any **emotional-safety / safeguarding** red flags?
8. What can we **honestly claim** the feature achieves?

## 5. What we'd like from you

- Concrete changes to the value-set, age-banding, and the delivery loop.
- Any red lines or content cautions, especially for the youngest band.
- Pointers to evidence we should build on.
- Whether you'd be open to **reviewing the authored content** before it ships, and/or advising on
  an ongoing basis.
