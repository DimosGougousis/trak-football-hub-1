# Trak — Task list

Tactical and knowledge work. None of these require strategic decisions — where a judgement call
comes up, flag it rather than deciding.

## Start with these three

| | Task | Why first |
|---|---|---|
| A1 | Verify the five untested features | Could shrink the whole backlog for free |
| C1 | Competitor and pricing teardown | Feeds the pricing decision without making it |
| B2 | Character scenario drafts | Long lead time; needed before the psychologist review |

---

## A. QA and verification

| | Task | Deliverable | Effort |
|---|---|---|---|
| A1 | Log in as each role and exercise the five features never tested against a live database: coach recognition/awards, coach schedule, coach AI assistant, athlete passport, club radar | Table: feature · works / broken / empty · what you saw · steps to reproduce | 1 day |
| A2 | Full cross-role run: create coach → add player → assess → log a match → link a parent → confirm all three roles see the right data | Bug log with screenshots | 1 day |
| A3 | Device check — the app is a 430px mobile shell. Test on real iOS and Android phones, and narrow screens | List of layout breaks by device | Half day |

> **Context for A1:** a parent-facing feature recently looked like it had never been built. It turned
> out the screens were finished and one database permission was missing, so it silently showed
> nothing. These five features are in exactly that unverified state — any could hold the same fault.
> Read "empty" as suspicious, not as "no data yet."

## B. Content authoring

| | Task | Deliverable | Effort |
|---|---|---|---|
| B1 | Coach knowledge base — training sessions and drills, grouped by the two phases matching Trak's age groups (U13–U16, U17–U19+) | Per session: name · objective · setup · duration · coaching points | Ongoing |
| B2 | Character scenarios — situational dilemmas for each of the six values (Composure, Respect, Effort, Teamwork, Responsibility, Sportsmanship), each with A/B/C options and a target answer | ~10 scenarios per value. Drafts only — a sports psychologist validates later | 1 week |
| B3 | Flashcards — short, kid-facing "what does this value look like on the pitch?" cards | 5–10 per value | 2 days |
| B4 | Expand the in-app coach manual, which is currently thin | Onboarding guidance a new coach could follow unaided | 2 days |

## C. Research

| | Task | Deliverable | Effort |
|---|---|---|---|
| C1 | Competitor teardown — Spond, TeamSnap, Coachbetter, Playermaker, Hudl, Veo, MatchTrackr | Comparison table: features · pricing · who pays (club, coach, parent) | 2 days |
| C2 | Youth curriculum standards — how the FA, UEFA and the Greek federation structure age-group development and coaching badges | Summary of what is expected at each phase | 2 days |
| C3 | Existing TPSR and ROOTS implementations in youth sport — who runs them, what materials exist, what evidence is published | Annotated source list | 2 days |
| C4 | Greek market map — private schools and football academies that could host a pilot | List: name · size · contact · any tech already in use | 3 days |

## D. Operational prep

| | Task | Deliverable | Effort |
|---|---|---|---|
| D1 | Seed realistic demo data — believable squad, positions, assessments, match history | A demo account that can be shown to a school or academy without embarrassment | 1 day |
| D2 | Lawyer meeting prep — gather provider terms (Supabase, Lovable), a list of what data Trak stores per table, and any informal agreements already in place | Single folder of documents | 1 day |
| D3 | Asset inventory — where the logo, fonts and brand assets live, and who owns them | Inventory with ownership noted. Needed for the trademark question | Half day |

---

## Working notes

- **Flag, don't decide.** Anything touching pricing, the value set, or product direction comes back
  rather than being settled.
- **Evidence over opinion.** For QA work, always include what you saw and how to reproduce it.
- **Content is draft until validated.** Character material is reviewed by a sports psychologist
  before it ships; write freely, nothing is final.
