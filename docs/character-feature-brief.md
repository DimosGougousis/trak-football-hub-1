# Trak — Character Building Feature Brief

*Working brief. Last updated: 2026-06-29.*

## Context & intent

This is **an additional feature inside Trak — not a pivot.** Trak stays exactly as intended:
a football development tool with the **coach as the primary user**. We add a **character-building
feature** that teaches behavioural skills (drawing on how rugby codifies and drills conduct),
delivered to the **kids** so they finally have an active role in the app.

Two things it does at once:
1. **Gives the kids work to do.** Today Trak is built for kids but the coach does all the
   logging and assessing; the kids are passive. The character feature is the one place the
   *kid* engages — learns, decides, reflects, acts.
2. **Gives coaches a second lens.** Coaches see each player's **ethical/behavioural progress
   alongside performance** — "the complete player," not just the footballer.

It is pedagogical, gamified, and pushes real-world action (it leaves the screen and shows up
on the pitch).

## Principles (the guardrails)

- **Never grade, score, or rank character.** No character "rating," no leaderboard, no
  deficiency labels. Progress is collection- and streak-based (engagement + demonstrated
  behaviour), never a verdict on the child.
- **Coach stays primary and low-effort.** The feature mostly runs itself; the coach nudges
  and recognises.
- **Reward consistency and real action over one-off taps** — to blunt "performing
  sportsmanship for points" (social-desirability gaming).
- **Reuse, don't reshape.** Lean on systems Trak already has.

## The feature: a learn → apply → act loop

The three pieces are one learning cycle, not three features:

1. **Learn — flashcards.** Bite-size value cards ("what does respecting the ref actually look
   like?"). Active recall; the reason a kid opens the app between sessions.
2. **Apply — situational scenarios.** A short football dilemma tests the value. The kid picks a
   response and gets pedagogical feedback — never a grade.
3. **Act — real-world challenge.** "At training, be the one who collects the cones without being
   asked." The kid marks it done. This is the bit that keeps them *active* and bridges screen
   to pitch (the behavioural "transfer").

Occasional wildcard: **Spot-it** — tag a teammate who showed the value (peer/social layer).

## Cadence model (the engagement engine)

Separate the **rhythm** (steady, habit-forming) from the **format** (rotating, never repetitive),
and anchor it to **when they actually play**, not the calendar.

- **Weekly value theme** — one value per week gives narrative structure (low coach effort).
- **One short moment per logged session** — triggered when the coach logs a training/match, so
  it lands at the real cadence of their sport (~2–3×/week), never a forced daily chore. 60–90s.
- **Optional "extra reps"** — a small pull-based library for keen kids to unlock badges. Never
  mandatory; no penalty for skipping.
- **End-of-week payoff** — a recap + badge + a coach shout-out prompt. Closure and a reason to
  return.

**Format rotates** so the recurring moment is never the same shape twice (Learn / Apply / Act /
Spot-it), and the *order* rotates week to week.

**Spiral curriculum for longevity** — after the value-set completes, it repeats at a deeper tier
(same value, harder scenario), e.g. "don't argue with the ref" → "your captain is arguing, what
do you do?" → "you're captain, your best player is losing it." Never runs dry; completing a
season unlocks the next tier + a season badge.

## The 6-week cycle (illustrative)

Assumes ~2–3 logged touchpoints per week.

| Wk | Value | What it looks like in football | Badge |
|---|---|---|---|
| 1 | Respect | Accepting the ref's call, no dissent, shaking hands | "Plays the Game" |
| 2 | Composure | Staying calm after a bad tackle, a miss, a goal conceded | "Ice" |
| 3 | Effort | Tracking back, work rate, trying hardest when losing | "Engine" |
| 4 | Teamwork | Encouraging teammates, no blame, celebrating others | "Team First" |
| 5 | Responsibility | Owning mistakes, your own warm-up/gear, honesty | "Stands Up" |
| 6 | Sportsmanship | Winning humbly, losing with dignity, respecting opponents | "True Competitor" |

Touchpoint format rotates per week (e.g. Wk1: Learn→Apply→Act; Wk2: Apply→Act→Learn; …).
Completing 2 of 3 moments in a week earns that week's badge.

## Player card integration — two lenses on one card

Character progress **feeds the player card** (this is the main engagement driver), but on its
**own axis** — distinct from the performance band, never blended into it.

- **The hard rule:** character must never move the 0–10 football rating. Blending it makes the
  performance number dishonest *and* re-introduces graded character. Keep them side by side.
- **Industry alignment:** this mirrors the FA's **Four Corners** model (Technical, Physical,
  Psychological, Social) — character is already a recognised, co-equal corner of player
  development. Adding a character corner brings the card in line with how academies think, and
  gives coaches a credible "complete player" story.
- **What shows (collection/streak-based, not scored):** values demonstrated, badges earned,
  current streak, season progress. All *engagement and effort* — in the kid's control, never a
  ranking.
- **What never shows:** a character number, a grade, or any child-vs-child comparison.

### Conceptual card structure (structure only — not UX)

```
┌─────────────────────────────────────────────┐
│  ANDREAS · CM · U15                           │   ← identity (unchanged)
├─────────────────────────────────────────────┤
│  LENS 1 — PERFORMANCE  (existing, untouched)  │
│  Band: Good  ·  evolution over time           │
├─────────────────────────────────────────────┤
│  LENS 2 — CHARACTER  (new, separate axis)     │
│  Values shown:  ✓Respect ✓Composure ·Effort   │
│  Streak: 4 weeks   ·   Season 1: 5/6           │
│  Badges: Plays the Game · Ice · Engine        │
│  (coach-only) light note: "calmer w/ refs"    │
└─────────────────────────────────────────────┘
```

Two lenses, one card = "the complete player." Performance stays exactly as is; character grows
by participation and demonstrated behaviour.

## Reuse of existing Trak systems

- **Session logging** (coach logs training/match) → **triggers the character moments**.
- **Dormant medal/recognition system** (`recognition_awards`, medal types like `self_aware`,
  `on_a_roll`) → finally switched on to power **character badges**. Plumbing already exists.
- **Daily-habit pattern** (wellness check-in) → proof that kids will do a small recurring thing;
  the moment-drip rides the same behaviour.
- **Player profile / player card** → gains the character corner (Lens 2).
- **Do NOT reuse** the performance rating engine / bands for character (see the hard rule).

## Open decisions

- **Content ownership:** a fixed value-set we author (football's "TREDS") vs. coach-configurable
  per team.
- **Coach involvement:** fully automatic value drip vs. coach assigns a weekly focus (light touch).
- **Coach visibility depth:** "engaged / on a streak" only vs. per-value progress vs. a soft
  observational note.
- **Final value-set & names**, age range, and the assumed sessions-per-week.
- **Anti-gaming weighting:** how much weight real-world challenges and coach corroboration carry.

## Out of scope (deliberately)

New roles, a separate "schools" product, multi-sport UI, school onboarding/GDPR sales motion,
analytics dashboards, AI features. All previously discussed; all parked. This is one additive
feature for Trak's existing users.

> Note: the earlier `character-education-strategy.md` and `pilot-pitch-onepager.md` describe the
> larger "separate schools product / pivot" framing, which this brief supersedes. They can be
> revisited if the standalone-schools direction is ever picked back up.
