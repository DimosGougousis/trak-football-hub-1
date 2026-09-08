# Open Questions for the Product Owner

Entries are appended by `scripts/uc-check.mjs` when a use case fails, drifts,
or is edited without authority. Resolve one by picking an option, doing it,
and changing `Status: OPEN` to `Status: RESOLVED <date>`.

Never resolve a question by weakening the assertion in the test.

---

## Q-2026-09-07-01 · UC-P02, UC-P03, UC-P06 · Parent visibility of the child's goals
Raised: 2026-09-07 · seeded during harness design · REQ-004

IN use case 12 of the 2026-07-27 pilot scope reads "Parent sees child's season
band, match feed and coach assessments". The role inventory in the same
document also lists P4, "See child's goals". These disagree.

The registry currently follows the IN list: **parent goal visibility is not a
use case** and `src/pages/parent/ParentGoals.tsx` is therefore untested and
unenforced, despite the route existing.

PO decision needed — one of:
  [ ] IN list stands -> parent goals are out of pilot scope; remove the route
  [ ] Inventory stands -> add UC-P04 to the registry and build it properly
  [ ] Ambiguous -> restate what a parent should see, and the registry follows

Status: OPEN

---

## Q-2026-09-07-02 · UC-C03, UC-A04, UC-X02 · Failed loads render as empty states
Raised: 2026-09-07 · found while writing UC-C03 · REQ-004

Every list screen destructures only `{ data }` from Supabase and falls back to
`[]`, so a permission failure, a network failure and a genuinely empty result
render the same message. Confirmed in `src/pages/coach/CoachSquadPage.tsx:16`
and, identically, in `src/pages/player/PlayerMatches.tsx` (`const { data } =
await supabase...` then `const rows = data || []`); the same pattern is also
in `ParentHome.tsx` and `ParentMatches.tsx`.

UC-C03 and UC-X02 both forbid this; UC-A04's third `then` clause ("A failed
load is distinguishable from an empty history") forbids the same thing for
`PlayerMatches.tsx` and fails on exactly this defect in
`tests/usecases/athlete/UC-A04.match-history.test.tsx`. UC-C03 and UC-A04
therefore both stay `pending`.

PO decision needed — one of:
  [ ] Spec stands -> fix the four screens to show a retryable error
  [ ] Spec changes -> bump spec_version and state what a failed load may show
Status: OPEN

---

## Q-2026-09-08-01 · UC-A02, UC-A03 · Athlete match logging has no reachable entry point
Raised: 2026-09-08 · found while repairing the use-case harness after merging main · REQ-001

`main` deleted `src/pages/player/PlayerLogForm.tsx` and removed the
`/player/log` route from `src/App.tsx`. Nothing left in `src/` references
either. UC-A02, "Log a match with position inputs and live band preview", is
REQ-001 — the use case the pilot's central hypothesis depends on — and it now
has no screen to exercise. `tests/usecases/athlete/UC-A02.log-match.test.tsx`
fails on all three assertions for exactly this reason and has been left
failing rather than repointed at a different screen or weakened.

`main` also deleted `src/pages/player/PlayerResult.tsx`, the screen UC-A03
("See band result after saving a match") exercises, along with
`PlayerLogForm.tsx`. There is no result screen and no route to reach one.
UC-A02 and UC-A03 are two halves of the same player-driven flow — log, then
see the band — and both halves are now gone from `src/`: neither the logging
step nor the band feedback that follows it has a reachable entry point. No
`tests/usecases/athlete/UC-A03...` test has been written against a screen
that no longer exists, and UC-A03 has not been repointed at another screen;
it stays `pending` in the registry, unbuilt, for the same reason UC-A02 stays
failing rather than being weakened or deleted.

`CLAUDE.md` documents a `log_match_for_player` RPC, and it is in fact called
from `src/pages/coach/CoachAddSession.tsx` and
`src/pages/coach/CoachQuickMatchLog.tsx` — both coach-driven. So match logging
appears to have moved from player-driven to coach-driven, not simply been
dropped. If that move is intentional, it changes the pilot's player-first
thesis and REQ-001 itself, not just these two use cases — REQ-001 depends on
both UC-A02 and UC-A03.

PO decision needed — one of:
  [ ] Spec stands -> restore a player-reachable match-logging screen and route,
      and a result screen for the band feedback that follows it
  [ ] Spec changes -> logging is coach-driven now; rewrite REQ-001, UC-A02 and
      UC-A03 (and any other player-first use cases that assume them) to match
  [ ] Ambiguous -> clarify whether the pilot's player-first thesis still holds
      before the registry is changed either way

Status: OPEN
