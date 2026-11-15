# Squad tab: Snapshot, Attributes, Availability, Games Statistics — design

Date: 21 Oct 2026 · Owner: Dimos (PM) · Source mockups: `Squad-Management-Mockups.html`
(screens 3–6 and the desktop top nav; synthetic Rehearsal FC data).

## Intent

A coach needs to know where the squad stands and what to prepare. That means
who moved band, which attribute to train next, who is coming on Saturday, and
how the season's games are going. Today `/coach/squad` is a phone directory
with search, filters and a player panel. Dimos has called that list obsolete.
`/coach/squad` becomes a wide, coach-only workspace with four tabs, built from
data Trak already records plus one new coach-written field: availability
confirmations.

Coaches use these screens only on a tablet or in a web browser.

## Goals

- `/coach/squad` shows a top tab bar, as in the mockup's desktop header, with
  **Snapshot · Attributes · Availability · Games Statistics**. Snapshot is the
  default. The open tab lives in the URL (`?tab=snapshot|attributes|availability|games`),
  so a reload or a shared link keeps it.
- Layout targets tablet (≥768px) and desktop (up to the mockup's 1280px
  content width). It is not held to the 430px phone column, the same way
  `TrainingsPage` spans the window. The mockup's `flex-wrap` columns stack on
  narrow widths so nothing breaks on a phone, but the phone is not designed for.
- The header holds the squad picker when the coach has two or more squads
  (`useCoachSquad`, shared with Home), plus the coach avatar. The app's coach
  NavBar stays at the bottom for app-level navigation *(my call: the mockup
  shows no app nav, and without it the coach has no way back to Home)*.
- **Synthetic data:** 3 months of Rehearsal FC U10 data in a seed for a local
  database only, so every tab shows a believable picture.

## Non-goals

- Overview and Register tabs (mockup screens 1–2), the parent-meeting brief
  (screen 7) and the phone screens (8–10).
- "Remind N families" and "Next: line-up" on Availability. The mockup itself
  marks Remind as needing its own wording and consent rules, and there is no
  line-up feature.
- Any change to the guardian or player apps. Families answer in a WhatsApp
  group. Reading that group automatically is out of scope for now. The
  existing "Can't make it" flow (TRAK-137/183) is untouched.
- Greek translation. The app is English today.

## Anti-goals (failure even if it works)

- Showing any of these views to players or guardians, or ranking children
  against each other. Each child is compared only with their own previous
  assessment (mockup caption).
- Showing or asking for a reason for an absence. The database may hold one
  from "Can't make it", but the coach view never displays it.
- Treating "not recorded" as zero.
- Minutes played, in any form (balance, share of available minutes, minutes
  owed). Trak does not capture minutes played (Dimos, 22 Oct).
- Writing synthetic data, or any development SQL, to the shared production
  Supabase project. PR previews use that backend too (AGENTS.md).
- Inventing data the database doesn't hold, such as a match format, to fill a
  mockup number.

## Removed: today's Squad list

The search field, the position and age filters, the consent chips, the player
bottom sheet and `QuickAdd` on this screen all go. Where a coach still needs
a player, the tabs link to the existing `/coach/player/:id` profile (child
names in Snapshot and Games Statistics are links). Assessing still starts from Home or
`/coach/assess`. Tests that assert the old list are replaced. The TRAK-180
screen-memory key `coach-squad` is no longer written.

## Tab 1 — Snapshot (mockup screen 3)

- Subtitle: "Latest band per child · N assessed · M not yet admitted".
  "Not yet admitted" means `coach_squad_player_consent_required` is true.
- **Spread bar:** one segment per band that has children, in BANDS order and
  colours (`BANDS`, `BandPill`). Below it, seven band columns, each with a
  count and the children in it. A child's band comes from their latest
  `coach_assessments.coach_rating` → `scoreToBand`, read the way today's
  Squad reads it (RLS-scoped, academy-wide). Each child shows ↑ or ↓ when that
  band differs from their own previous assessment's band.
- **Changes since last assessment:** every child whose band moved, biggest
  move first, shown as old pill → new pill. Each has an "Open profile" button.
  The mockup's "Send a message" for rises becomes "Open profile" too, because
  this screen has no message feature *(my call)*.
- **What the coach does next:** short lines generated from the data: a drop →
  "Talk to X"; a drop plus missed trainings → mentions both; rises → "Tell X,
  Y and Z what they did well". Training attendance uses the existing
  `attendance-rate` rules.
- A drop is flagged after **one** lower assessment. See the open decision
  below.

## Tab 2 — Attributes (mockup screen 4)

- The heatmap rows are the six attributes the coach scores: Work rate
  (`work_rate`), Technical, Physical, Coachability, Attitude, Tactical.
  Columns are the last 6 weeks, Monday to Sunday in the academy's time zone.
  Each cell is the squad average (1–10, one decimal) of that week's
  assessments. A week with none shows "—", not a zero. Cell shade comes from
  the theme's brand token, not the mockup's hard-coded green.
- **Range** column: lowest–highest of each child's latest score for that
  attribute, labelled "wide" when the spread is 5 or more and "narrow"
  otherwise *(my call on the threshold)*. **Trend** column: latest week with
  data minus earliest week with data, shown as ↑ or ↓.
- **Focus this week:** the attribute with the lowest latest average, with a
  generated sentence about its average, how long it has fallen and its range.
  The mockup's "6 Tactical sessions in Trainings →" button opens the coach
  Trainings tab. Use the catalogue's `lib` parameter if a library matches the
  attribute, otherwise open the catalogue plainly. Session counts appear only
  if the catalogue exposes them.
- Static cards "How to read the range" and "Coach-only…", as in the mockup.

## Tab 3 — Availability (mockup screen 5, revised)

**Model.** Families confirm in a WhatsApp group. The coach reads it and marks
each child **Confirmed** in this tab. Everyone else is **Not confirmed**. The
columns follow only the coach's tick. A "Can't make it" report from the
existing guardian flow is an **"Reported can't make it"** tag on the child,
in whichever column the child is in. The coach can always confirm or
unconfirm, in either order. A confirmed child who also has a report shows the
tag in Confirmed, so the coach sees the clash and decides. A withdrawn report
just removes the tag *(my call: the WhatsApp group may be more recent than
the app, so the coach's tick decides)*.

- **Event:** the next published, not-cancelled event of the selected squad
  (`coach_calendar_events`, squad match, `starts_at` ≥ now), with a
  previous/next control to step through upcoming events. The header shows a
  type chip (Match or Training), date, opponent, and a mono line with
  kick-off, home/away and venue. Only fields the event holds are shown.
- **Two columns:** Confirmed and Not confirmed, each with a count chip. Rows
  show shirt number, name and position. Tapping a row toggles Confirmed. The control is a button
  with a visible state, works by keyboard, and has a min-height of 44px.
  A "Confirm all" shortcut is up to the builder.
- **Not eligible:** children waiting for consent are listed in a warning
  callout, as in the mockup, and cannot be confirmed. The database refuses it
  too.
- **Squad card:** "N confirmed · M not confirmed", the goalkeepers among the
  confirmed, and a warning when no goalkeeper is confirmed. There is no
  "need 10" line: events store no match format *(my call)*.
- Callout: "Confirmations come from your WhatsApp group; families don't see
  them in Trak."
- Confirming is allowed until the end of the event's day in the academy's
  time zone (the event's `ends_at` is not used), so the coach can fix it on
  the day.

**Backend (new migration; applied history unchanged).**

- Table `event_confirmations(event_id → coach_calendar_events ON DELETE
  CASCADE, squad_player_id → squad_players ON DELETE CASCADE, confirmed_by →
  auth.users, confirmed_at timestamptz default now(), PK (event_id,
  squad_player_id))`. RLS is on. There are no `anon` privileges and
  `authenticated` gets SELECT only.
- SELECT policy: the event's coach only (`e.coach_user_id = auth.uid()`).
  Families never read it.
- Writes go only through `confirm_event_attendance(p_event_id, p_squad_player_id)`
  and `unconfirm_event_attendance(...)`, both SECURITY DEFINER with
  `search_path = ''`. They check that the caller is the event's coach, the
  squad row is theirs (`squad_player_is_mine`) and in the event's squad, the
  child needs no consent (`coach_squad_player_consent_required` false), the
  event is published and not cancelled, events are switched on for the
  academy (J8.1), and the event hasn't ended. Refusals are 42501 with a
  readable message, as in `absence_target`.
- Tests in `supabase/tests` run under real roles: the coach can confirm and
  undo; another academy's coach, a guardian, a player, a consent-pending
  child, a cancelled event, an ended event and events switched off are all
  refused. Nobody else can read the table.
- `registry.yaml`: add a use case for coach-marked confirmation under J8,
  pending, then run `npm run uc:report`.

## Tab 4 — Games Statistics (mockup screen 6, was Season) — the season builds up

"Builds up" means every figure accumulates from the season's first match to
today and grows as the coach logs matches. Nothing is a fixed snapshot.

- **Heading:** "Games Statistics", with the sub-line "Season 2026–27 · N
  matches" ("1 match" for one).
- **Season window:** 1 July to 30 June *(my call: Trak has no season setting,
  see `age-group.ts`; 1 July keeps the 3-month demo inside one season)*.
- **Tiles:** Played · Won · drawn · lost · Goals for – against.
- **Running chart** below the tiles: cumulative goals for and against and the
  W/D/L record by match date, so the build-up is visible *(my call on the
  form; keep it a simple line chart in the app's existing charting
  library)*.
- **Per-player table**, sorted by appearances (most first), then name:
  number, name (links to profile), appearances, goals, assists. A roster
  child with no appearances shows 0; a consent-pending child is left out.
- Every logged match counts for appearances, goals and results, whether or
  not minutes were entered when it was logged.
- **Results** list: W/D/L chip, opponent, date, score, newest first.
- **"Numbers don't add up" callout:** when a match's player goals don't sum to
  its team score, name the match and link to its session
  (`/coach/sessions/:id`).
- **Which matches count** *(my calls)*: only `matches` rows **logged by this
  coach** (`logged_by = auth.uid()`, `logged_by_role = 'coach'`) for children
  whose squad row is theirs (`squad_player_is_mine`). With two squads, only
  children whose squad row's `age_group` is the selected squad. A colleague's
  or a player's own logs never count. **One match** = this coach + match date
  + opponent, the same key `log_match_for_player` uses for TRAK-149 totals.
  Its result is the team/opponent score on those rows.
- **Backend:** coaches cannot SELECT `matches` today. Add a SECURITY DEFINER
  read function, e.g. `coach_squad_season(p_from date, p_to date, p_squad
  text)`, applying the rules above and returning one row per child per match:
  match date, opponent, session id (nullable), team score, opponent score,
  squad_player_id, minutes (unused by the views since 22 Oct), goals,
  assists. Read `matches` only, not `session_attendance`, so nothing is
  double-counted. Test the scoping under
  real roles: another academy's coach, a colleague's logs, a player's own
  logs and the other squad are all excluded.
- The "Numbers don't add up" link opens `/coach/sessions/:id` when the match
  has a session, otherwise `/coach/sessions/list`.

## Synthetic data (local only)

- New seed, e.g. `supabase/seeds/squad_views_demo.sql`. It refuses to run
  unless the database is local, and keeps the password out of the file, like
  `dev_data.sql` (`trak.dev_password`).
- Rehearsal FC, one coach with squad U10: 13 children with the mockup's
  synthetic names, 12 admitted and 1 consent pending, with two goalkeepers.
- 22 Jul – 21 Oct 2026 (3 months): two trainings a week with attendance
  (Leo M. tailing off), a match most Saturdays with scores, minutes, goals and
  assists (one match with a missing scorer, one quick-logged without
  minutes), and assessments every 1–3 weeks per child. Tactical drifts down
  and Leo, Yusuf, Sami, Omar and Ethan move as in the mockup.
- Upcoming published events: a training on Thu 22 Oct and a match on Sat
  24 Oct, with a few confirmations and one guardian "Can't make it".
- How to run it locally (Supabase local stack, migrations, seed, `.env.local`
  pointing at it) goes in the seed's header and the README's local section.

## Delivery

- Issue **TRAK-250: Squad**. One branch and one PR covering the migration
  (confirmations plus the season read for Games Statistics), the four tabs,
  the local seed and the registry entry.
- **Straight swap** (Dimos, 21 Oct): the phone Squad list goes away when this
  merges. There is no feature switch and no parallel old page. The old
  page's tests are replaced.

## Constraints

- Project rules in `AGENTS.md`: one PR per issue, with `TRAK-#` and the J/G
  purpose in the title. Public repo, synthetic names only. Use new migrations;
  new tables start without `anon`/`authenticated` grants. `.maybeSingle()` /
  arrays / errors are handled separately from empty results.
  `coach_assessments.squad_player_id` is a squad row, not a user.
- Design tokens (`--t-*`, TRAK-189 role tokens, the TRAK-213 theme picker),
  `BANDS` for band words and colours, and Arc components where they fit.
- Every read failure shows a retryable error, never an empty squad (UC-X02
  pattern in the current Squad page).

## Open decision (from the mockup)

- Flag a drop after one lower assessment, or only after two in a row?
  Defaulted to **one**, matching the mockup's example. Changing it is a
  single constant.

## Left to the builder

Component split, query keys, chart library choice among existing deps, exact
copy beyond the mockup's, "Confirm all", and test layout. Events with no
squad follow the existing family rule (`squad IS NULL OR age_group = squad`).
Confirming is allowed until the end of the event's day in the academy's time
zone (the event's `ends_at` is not used). "Missed trainings" in Snapshot
means 3 of the last 4. The Focus button opens the Trainings catalogue without a filter unless a
library matches the attribute exactly (Tactical has three, so it has no
filter).
