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
