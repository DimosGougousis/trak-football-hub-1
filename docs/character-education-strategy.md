# Trak — A Development Tool That Promotes Values
### Strategy & Pilot Roadmap

*Internal strategy document. Last updated: 2026-06-26.*

---

## Context

Trak helps young athletes **improve** — track performance, log matches, build habits of
organisation and self-reflection, and see themselves progress. We are extending it to **also
promote good values and character through sport**, so it serves both the athlete (who wants
to get better) and the school (which wants to raise good teammates and good people).

Crucially, this is positioned **honestly**. Trak does not claim to fix behaviour, guarantee
outcomes, or solve any societal problem. It *promotes, supports, and builds habits*. The
motivation behind the values layer — concern about rising youth violence — is the *why we
built it*, never a marketing claim about *what it delivers*.

The first target is a pilot at a private school in Greece. Football is the focus; other
sports come later. Role/identity-model changes (school admin, teacher) are deferred until
after the school responds.

Established frameworks anchor the values layer (and must be validated by an educational/sport
psychologist and the school's pastoral lead before any claims are made):
- **TPSR (Hellison)** — five progressive levels of personal & social responsibility, driven
  by student self-reflection; developed for youth, including at-risk youth.
- **ROOTS (Positive Coaching Alliance)** — Rules, Opponents, Officials, Teammates, Self — the
  concrete sportsmanship compass.
- **IB Learner Profile (as inspiration)** — its power is a *shared language* the whole
  school speaks; we borrow that idea, not its content.

---

## 1. Positioning — performance is the hook, values ride along

The core narrative:

> **Performance is the hook. Values ride along.**

A young athlete opens Trak to track their game, log a match, stay organised, and see
themselves improve — that intrinsic pull is what earns daily engagement. The values layer
(reflection, respect, composure, effort) comes **woven into that same loop**, not bolted on
as a separate "character app" kids would ignore. One product, two payoffs:

- **What the athlete wants:** get better, see progress, feel in control.
- **What the school & parent want:** a good teammate and a good person.

The same reflection-and-improvement loop delivers both. This is also the smarter commercial
wedge: pure character apps fail because kids won't use them; Trak earns engagement through
football and lets the values come along for the ride.

## 2. Claims discipline (non-negotiable)

The honesty lives in the verbs — *promote, support, build habits*; never *fix, guarantee,
prove*.

| ✅ Honest to say | ❌ Never say |
|---|---|
| Helps young athletes improve, on and off the pitch | "Fixes behaviour" / "reduces violence" |
| Builds habits of self-reflection and organisation | "Guarantees better character" |
| Promotes the values of good sportsmanship | "Proven to change kids" |
| Built on established frameworks (TPSR, ROOTS) | "Scientifically proven results" |
| Gives schools a structured way to promote values through sport | "Solves the youth crisis" |

The youth-violence concern is private motivation, not a claim. We may say "sport is a
powerful place to practise self-control and respect"; we may not say "Trak lowers aggression."

## 3. The Trak Character Profile (the values thread)

A single, branded set of six values — the IB Learner Profile's equivalent for sport. It is a
**shared language**, not a graded system. *Draft, for validation with educators.*

| Value | What it looks like in football | Root in the science |
|---|---|---|
| **Composure** | Staying calm after a bad call, a foul, or a loss — no retaliation | SEL self-management |
| **Respect** | For opponents, officials, rules, teammates | ROOTS; TPSR L1 |
| **Effort** | Trying hard things, persevering, owning mistakes | TPSR L2; growth mindset |
| **Responsibility** | Integrity and self-direction, even when unseen | TPSR L3; ROOTS (Self) |
| **Care** | Helping a struggling teammate; reading others' emotions | TPSR L4; SEL social awareness |
| **Transfer** | Carrying all of the above to school, home, community | TPSR L5 |

Six is deliberately close to IB's count — memorable, brandable, kid-sized. The profile
threads through the product as a shared vocabulary; it is never a score or a ranking.

## 4. The values/assessment model — recommendation

**Lead with student self-reflection; add a light-touch teacher facilitation layer; bring
parents in read-only later.** Self-reflection *is* the mechanism (the act of reflecting builds
self-awareness). A thin teacher layer offsets self-report bias without adding workload.

**Critical design rule:** *do not score values with the existing competitive 0–10 band
system.* No labels like "Difficult," no leaderboards, no child-vs-child ranking. Values are a
personal growth journey. This is both correct pedagogy and the biggest trust/safeguarding
argument with a school. (The performance side of Trak keeps its bands; the values side does
not.)

## 5. How performance + values integrate in one loop

Nothing is bolted on — the values layer reuses loops Trak has or already planned:

- **Improve** (the original Trak, the hook): match logging, progress tracking, organisation,
  self-awareness — stays the backbone.
- **Reflect:** the same end-of-session reflection now carries a light values prompt ("how did
  you handle the bad call today?") alongside the performance one.
- **Recognise:** coaches catch and celebrate *both* a great performance *and* a great act of
  sportsmanship.
- **Profile thread:** the six values run through it as shared language — never graded.

## 6. How it maps onto the existing codebase

Reuse map for the build (no code changes in this phase):

| Capability | Reuse | Location |
|---|---|---|
| Daily values reflection | Mirror the `wellness_logs` daily-entry pattern | [supabase/migrations/20260327020250_bae14e5b-6186-4675-ab70-d1567e8660a7.sql](../supabase/migrations/20260327020250_bae14e5b-6186-4675-ab70-d1567e8660a7.sql) |
| Coach recognition of values | Extend the coach-assessment flow — **without** a competitive band rollup | [src/components/coach/CoachAssess.tsx](../src/components/coach/CoachAssess.tsx) |
| Profile / scenario content | New static config first (like the `BANDS` constant) | [src/lib/types.ts](../src/lib/types.ts) |
| School/teacher identity | Reuse `organizations` + `club`/`coach` plumbing (`organizations.type = 'school'`) — **deferred** | [supabase/migrations/20260608000001_organizations_table.sql](../supabase/migrations/20260608000001_organizations_table.sql), [src/components/layout/RouteGuard.tsx](../src/components/layout/RouteGuard.tsx) |
| Parent visibility | Reuse the existing read-only parent role | (existing parent routes/pages) |
| GDPR / account deletion | Reuse existing `delete_my_account()` tooling | [supabase/migrations/20260608000006_gdpr_delete_v2.sql](../supabase/migrations/20260608000006_gdpr_delete_v2.sql) |

**Do NOT reuse** `scoreToBand` / `BANDS` for values — see §4.
([src/lib/rating-engine.ts](../src/lib/rating-engine.ts))

## 7. Phased roadmap

- **Phase 0 — Pitch assets (this deliverable).** Strategy doc, one-pager, slide deck. No code.
- **Phase 1 — Pilot MVP (if the school says yes).** The improvement core + a values reflection
  thread + light coach recognition. Football-only, one school, one or two cohorts. Reuse
  existing patterns; growth-ladder UI, no bands on values.
- **Phase 2 — Facilitation & transfer.** Teacher facilitation prompts, the Transfer (Level 5)
  thread, parent read-only view. Decide the school/teacher role model from pilot feedback.
- **Phase 3 — Scale.** Multi-cohort/multi-school, educator content authoring, pastoral reporting.
- **Phase 4 — Multi-sport.** Generalise beyond football.

## 8. Pitch positioning & safeguarding

- **What the school buys:** a tool athletes will *actually use* to get better — that promotes
  the right values while they do. Honest, modest, still distinctive.
- **Low teacher burden:** students self-reflect; teacher facilitation is light-touch.
- **Pilot shape:** one cohort, one term, a clear before/after — the school risks little.
- **Data & safeguarding (decisive in the EU/Greece):** children's behavioural data — lead with
  GDPR posture (minimisation, parental consent, no public ranking, account-deletion tooling).
- **Expert validation:** the values framework and any developmental claims are validated with
  an educational/sport psychologist and the school's pastoral lead *before* the pitch hardens.
- **Success metrics, set *with* the school:** reflection completion rate; self-reported value
  progression; teacher-observed change; qualitative feedback. Never marketed as guaranteed.

## 9. Decisions deferred until after the school responds

- School/teacher role & identity model.
- Depth of the teacher facilitation layer.
- Whether parents are in the pilot or Phase 2.
- Final wording of the six values + scenario content — co-designed with the school and an expert.
