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
