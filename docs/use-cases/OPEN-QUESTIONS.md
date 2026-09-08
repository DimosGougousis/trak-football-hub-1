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

## Q-2026-09-07-02 · UC-C03, UC-X02 · Failed loads render as empty states
Raised: 2026-09-07 · found while writing UC-C03 · REQ-004

Every list screen destructures only `{ data }` from Supabase and falls back to
`[]`, so a permission failure, a network failure and a genuinely empty result
render the same message. Confirmed in `src/pages/coach/CoachSquadPage.tsx:16`;
the same pattern is in `PlayerMatches.tsx`, `ParentHome.tsx`, `ParentMatches.tsx`.

UC-C03 and UC-X02 both forbid this. UC-C03 therefore stays `pending`.

PO decision needed — one of:
  [ ] Spec stands -> fix the four screens to show a retryable error
  [ ] Spec changes -> bump spec_version and state what a failed load may show
Status: OPEN

---

## Q-2026-09-08-01 · UC-A02 · Athlete match logging has no reachable entry point
Raised: 2026-09-08 · found while repairing the use-case harness after merging main · REQ-001

`main` deleted `src/pages/player/PlayerLogForm.tsx` and removed the
`/player/log` route from `src/App.tsx`. Nothing left in `src/` references
either. UC-A02, "Log a match with position inputs and live band preview", is
REQ-001 — the use case the pilot's central hypothesis depends on — and it now
has no screen to exercise. `tests/usecases/athlete/UC-A02.log-match.test.tsx`
fails on all three assertions for exactly this reason and has been left
failing rather than repointed at a different screen or weakened.

`CLAUDE.md` documents a `log_match_for_player` RPC, and it is in fact called
from `src/pages/coach/CoachAddSession.tsx` and
`src/pages/coach/CoachQuickMatchLog.tsx` — both coach-driven. So match logging
appears to have moved from player-driven to coach-driven, not simply been
dropped. If that move is intentional, it changes the pilot's player-first
thesis and REQ-001 itself, not just this one use case.

PO decision needed — one of:
  [ ] Spec stands -> restore a player-reachable match-logging screen and route
  [ ] Spec changes -> logging is coach-driven now; rewrite REQ-001 and UC-A02
      (and any other player-first use cases that assume it) to match
  [ ] Ambiguous -> clarify whether the pilot's player-first thesis still holds
      before the registry is changed either way

Status: OPEN
