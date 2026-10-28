# Training tab: technical design

TRAK-293 is the product spec and wins on behaviour; its five sub-issues (TRAK-294 to TRAK-298) are the build order.
This file says how it is built: tables, read rules, routes and screens. A slice that changes a decision here updates
this file in the same PR.

## Objective

Each training gets a plan, written the coach's own way, and one loop: Plan → Who's here → Run it → Close. A coach who
uses their own drills types a plan fast and reuses it; a coach who wants help picks from the Library. Both land on the
same plan. Everything sits behind the `training` academy switch. With the switch off, Trak behaves exactly as today.

## Decisions this rests on

- TRAK-293's decisions (Kostas, 27 Oct), unchanged.
- **Training replaces Library in the nav** where the switch is on. The Library's pages (`/coach/trainings/...`) stay
  as they are and open from Training › Drills; on them the nav marks Training.
- **Coach only.** No player, guardian, other coach or academy admin reads a drill or a plan in this build, so there
  are no copy tables (unlike Games).
- **Times are the academy's.** Coming up and Last week compare instants (`starts_at`, `ends_at`), which the database
  sets on the academy's clock (TRAK-175). A training with no time lasts its whole day, as TRAK-230 locks it.
- **Not built** (TRAK-293): Build it with Trak, Homework, Value of the month, the objectives nudge, "What this session
  covers", the weekly check-in. Their data doesn't exist yet.

## Tables

Every new table: RLS on; nothing granted to `anon`; `authenticated` gets only the operations a rule below backs.
Every text field has a length limit.

| Table | Key | Holds | Slice |
|---|---|---|---|
| `coach_drills` | `id` | The coach's own single drills: name (≤80), usual minutes (5–60; the app offers 10–30), how it works (≤1000), what you'll tell them (≤500), and the five details area, numbers, direction, targets, conditions (≤120 each). | 294 |
| `training_plans` | `event_id` | One plan per training event (`coach_calendar_events(id) ON DELETE CASCADE`). | 295 |
| `training_plan_practices` | `event_id, position` | The plan's practices in order (at most 12): name, minutes, what you'll tell them, the five details, where it came from (own, a drill, the Library) and the drill or Library session it came from. | 295 |

## Read and write rules

**The coach** reads, adds, changes and deletes their own rows (`coach_user_id = (select auth.uid())`). Writes also
pass restrictive rules, as events do: `is_coach()` and the academy's `training` switch on (`feature_on('training')`).
Reads don't need the switch, so switching Training off hides the tab without losing anyone's drills or plans.

From 295, a plan's event must be the coach's own training, not cancelled. A plan is saved whole by one database
function (all practices or none), so a half-saved plan can't exist.

Nobody else reads these tables.

## Routes and screens

| Route | Screen | Slice |
|---|---|---|
| `/coach/training` | Training home, Sessions: Coming up (not over yet, soonest first) and Last week (over in the past 7 days, newest first), the squad pills, New session | 294 |
| `/coach/training/drills` | Training home, Drills: search, My drills, New drill / edit / delete (Arc bottom sheet), the Library's seven tiles | 294 |
| `/coach/training/:eventId/plan` | Write my own (and Copy a past session, 297) | 295 |
| `/coach/training/:eventId` | The plan, with the loop strip | 295, 298 |

Both routes are inside `ParkedScreen unless="training"`, so with the switch off the screen shows "Coming soon" and
every write handler stops at `useParked()`.

Code: `src/pages/coach/training/`, `src/components/coach/training/`, `src/lib/training/`.

## Switching it on

The operator runs one line (see `20261028020000_training_drills.sql`):

```sql
INSERT INTO public.academy_features(organization_id, feature) VALUES ('<academy id>', 'training');
```

Deleting the row switches it off at once.
