# Squad coach views (TRAK-250) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phone Squad list at `/coach/squad` with a wide, coach-only workspace with four tabs (Snapshot, Attributes, Availability, Season), backed by one new migration and a local-only 3-month demo seed.

**Architecture:** One migration adds `event_confirmations` (coach-written through two RPCs) and a read RPC `coach_squad_season` over `matches`. Pure TypeScript modules in `src/lib/squad/` turn rows into each tab's figures and are unit-tested. A thin shell page holds the URL-driven tab bar, and one component per tab reads data through TanStack Query. A SQL seed fills a local database only.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Tailwind with `--t-*` role tokens, Arc components, recharts 2.15, Supabase (Postgres RLS, SECURITY DEFINER RPCs), vitest + MSW, the `scripts/test-db.mjs` SQL harness.

**Spec:** `docs/superpowers/specs/2026-10-21-squad-coach-views-design.md`. Read it before starting any task.

## Global Constraints

- Branch `dimos/trak-250-squad` from current `main`. One PR, titled `TRAK-250 [J8/scope] Squad: Snapshot, Attributes, Availability, Season`, kept as a draft until complete.
- The commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Public repo: synthetic names only (Rehearsal FC, the mockup's children). No credentials in any file. The seed takes the password from `trak.dev_password`.
- New migration only. Never edit an applied one. `event_confirmations` gets no `anon` privileges and SELECT only for `authenticated`. Writes go through RPCs (`SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`).
- Refusals raise `ERRCODE = '42501'` with readable text, as `absence_target` does.
- `.maybeSingle()` for zero-or-one rows. Every read error is shown with a "Try again" button, never as an empty squad.
- Band words and colours come only from `BANDS` / `BandPill` / `scoreToBand`. Colours come only from `rgb(var(--t-…))` tokens. Never a hard-coded green.
- "Not recorded" is never shown as 0. A missing week or minutes figure renders as `—`.
- No absence reason is rendered anywhere in the coach view.
- Local-only seed: nothing is run against the shared Supabase project.

## Review Focus

1. **Brand-new squad** (players, no assessments, matches or events): every tab shows a plain empty state, with no NaN, no 0% and no crash. *(Tasks 4–7: "empty" tests)*
2. **Two squads:** switching the squad picker changes all four tabs, and Season passes `p_squad`. *(Task 3 test "squad picker scopes every tab")*
3. **Partial data:** a week with no assessments, or a match with no minutes, shows `—` and is excluded from the averages and minutes figures. *(Task 2 lib tests)*
4. **Read failure** on any tab shows a retryable error. A failed confirm leaves the row where it was and shows the database's message. *(Task 3 and Task 7 tests)*
5. **No upcoming event:** Availability says "No upcoming events" and links to `/coach/schedule`, instead of a blank pane. *(Task 7 test)*

---

### Task 1: Migration, confirmations and the Season read (with SQL tests)

**Files:**
- Create: `supabase/migrations/20261021120000_squad_views.sql`
- Create: `supabase/tests/squad_views.sql` (header `-- @trak-suite mode=--squad-views-review in-all=true`; copy the helper pattern from `supabase/tests/event_absences.sql`: disposable guard, `pg_temp` actor/ok/refused helpers, results table, single `ROLLBACK`)
- Modify: `src/integrations/supabase/types.ts` (add the table to `Tables`, the three functions to `Functions`)

**Interfaces:**
- Produces (SQL):
  - table `public.event_confirmations(event_id uuid FK coach_calendar_events ON DELETE CASCADE, squad_player_id uuid FK squad_players ON DELETE CASCADE, confirmed_by uuid NOT NULL FK auth.users ON DELETE CASCADE, confirmed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (event_id, squad_player_id))`, plus an index on `squad_player_id`. The single SELECT policy is "Coaches read their events' confirmations": `EXISTS (event e WHERE e.id = event_id AND e.coach_user_id = (SELECT auth.uid()))`.
  - `trak_private.confirmation_target(p_event_id uuid, p_squad_player_id uuid) RETURNS void`, revoked from everyone. Checks run in this order with these exact messages:
    1. event missing or `e.coach_user_id <> auth.uid()` → `Only the event's coach can confirm attendance`
    2. NOT `public.squad_player_is_mine(p)` OR `sp.coach_user_id <> e.coach_user_id` OR `sp.status = 'coach_departed'` OR NOT (`e.squad IS NULL OR sp.age_group = e.squad`) → `This child is not in this event's squad`
    3. `public.coach_squad_player_consent_required(p)` → `Waiting for consent: nothing is recorded about this child until a guardian approves`
    4. NOT `e.published` → `This event is not published`
    5. `e.status = 'cancelled'` → `This event is cancelled`
    6. NOT `trak_private.academy_has_events(e.organization_id)` → `Events are switched off for this academy`
    7. `now() >= ((coalesce(e.event_date, (e.starts_at AT TIME ZONE tz)::date) + 1)::timestamp AT TIME ZONE tz)`, where `tz = trak_private.academy_time_zone(e.organization_id)` → `This event has ended`
  - `public.confirm_event_attendance(p_event_id uuid, p_squad_player_id uuid) RETURNS void`: calls the target check, then `INSERT ... ON CONFLICT DO NOTHING`.
  - `public.unconfirm_event_attendance(p_event_id uuid, p_squad_player_id uuid) RETURNS void`: calls the target check in `DECLARE` (as `undo_cant_make_it` does), then `DELETE`.
  - `public.coach_squad_season(p_from date, p_to date, p_squad text DEFAULT NULL) RETURNS TABLE(match_date date, opponent text, session_id uuid, team_score integer, opponent_score integer, squad_player_id uuid, minutes_played integer, goals integer, assists integer)`, `STABLE SECURITY DEFINER`. The rows are `matches m JOIN squad_players sp ON sp.linked_player_id = m.user_id`, filtered by `sp.coach_user_id = auth.uid()`, `public.squad_player_is_mine(sp.id)`, `m.logged_by = auth.uid()`, `m.logged_by_role = 'coach'`, `m.match_date BETWEEN p_from AND p_to` and `(p_squad IS NULL OR sp.age_group = p_squad)`. Use `DISTINCT ON (m.id)` so a child with two of this coach's squad rows appears once. Order by `match_date, opponent`.

- [ ] **Step 1: Create the branch.** `git switch main && git pull && git switch -c dimos/trak-250-squad`. The untracked mockup and `Legal/` files stay untracked.
- [ ] **Step 2: Write `supabase/tests/squad_views.sql`.** Fixtures: academy A with events on and academy B. Coach A1 owns U10 and U12 rows; coach A2 is a colleague in A; coach B1. U10 children c1 (admitted, linked) and c2 (consent pending). A U10 event, published and future (`ev`); a cancelled one; an unpublished one; one dated yesterday; one with `squad = 'U12'`. Matches for c1: two logged by A1 (one of them U10), one by A2, one self-logged by c1. Checks, one label each:
  - `SV01` A1 confirms c1 on `ev` → ok; the row exists; confirming again is ok and still leaves 1 row
  - `SV02` A1 unconfirms → ok, 0 rows
  - `SV03` A2 confirms c1 on `ev` → refused `Only the event's coach`
  - `SV04` B1 → refused `Only the event's coach`
  - `SV05` c2 → refused `Waiting for consent`
  - `SV06` cancelled → `This event is cancelled`; unpublished → `not published`; yesterday → `has ended`; U12 event with a U10 child → `not in this event's squad`
  - `SV07` events switched off for A (delete the `academy_features` row inside a savepoint) → `switched off`
  - `SV08` a guardian or player actor calling confirm → refused; direct `INSERT INTO event_confirmations` as `authenticated` → refused (42501 permission denied)
  - `SV09` SELECT visibility: A1 sees its rows; A2, B1, a guardian and a player see 0
  - `SV10` `coach_squad_season` as A1 returns only A1's coach-logged rows (not A2's, not self-logged); with `p_squad => 'U12'` it returns none for c1's U10 row; as B1 it returns 0 rows; as `anon` it is refused
- [ ] **Step 3: Run it and see it fail.** `npm run test:db -- --squad-views-review`. Expected: failure because `event_confirmations` does not exist.
- [ ] **Step 4: Write the migration** to the interface above, with a header comment naming TRAK-250, the WhatsApp model, and why families can't read it.
- [ ] **Step 5: Run it and see it pass.** `npm run test:db -- --squad-views-review`. Expected: every `SV` label ok. Then run `npm run test:db -- --event-absences-review` and confirm it is still green.
- [ ] **Step 6: Add the types** to `types.ts`, matching the shape of the generated entries, and run `npm run typecheck`. Expected: exit 0.
- [ ] **Step 7: Commit.** `feat(TRAK-250): coach-marked event confirmations and the coach's season read`

### Task 2: Pure figures for the four tabs

**Files:**
- Create: `src/lib/squad/snapshot.ts`, `src/lib/squad/attributes.ts`, `src/lib/squad/season.ts`, `src/lib/squad/availability.ts`
- Test: `src/lib/squad/__tests__/snapshot.test.ts`, `attributes.test.ts`, `season.test.ts`, `availability.test.ts`

**Interfaces (Produces):**

```ts
// snapshot.ts
export const DROP_AFTER = 1 // open decision in the spec: lower assessments in a row before a drop is flagged
export type AssessmentRow = { squad_player_id: string; coach_rating: number | null; created_at: string;
  work_rate: number; technical: number; physical: number; coachability: number; attitude: number; tactical: number }
export type BandMove = { squadPlayerId: string; band: BandType; previous: BandType | null; move: -1 | 0 | 1 } // 1 = up the BANDS list
export function bandMoves(rows: AssessmentRow[]): Map<string, BandMove>          // rows in any order; null ratings skipped
export function bandSpread(moves: Map<string, BandMove>): { band: BandType; ids: string[] }[] // all 7, BANDS order
export function nextSteps(moves: BandMove[], names: Record<string, string>, missedLast4: Record<string, number>): string[]

// attributes.ts
export const ATTRIBUTES = [ ['work_rate','Work rate'], ['technical','Technical'], ['physical','Physical'],
  ['coachability','Coachability'], ['attitude','Attitude'], ['tactical','Tactical'] ] as const
export type AttributeKey = typeof ATTRIBUTES[number][0]
export function weekStarts(todayISO: string, count?: number): string[]           // Mondays, oldest first, default 6
export type AttributeRow = { key: AttributeKey; label: string; weeks: (number | null)[];
  range: { min: number; max: number; wide: boolean } | null; trend: number | null; fallingWeeks: number }
export function attributeHeatmap(rows: AssessmentRow[], weeks: string[], dateOf: (iso: string) => string): AttributeRow[]
export function focusAttribute(rows: AttributeRow[]): { row: AttributeRow; sentence: string } | null

// season.ts
export type SeasonRow = { match_date: string; opponent: string | null; session_id: string | null; team_score: number;
  opponent_score: number; squad_player_id: string; minutes_played: number | null; goals: number; assists: number }
export function seasonWindow(todayISO: string): { from: string; to: string; label: string } // 1 Jul–30 Jun, label "Season 2026–27"
export type SeasonMatch = { key: string; date: string; opponent: string | null; sessionId: string | null;
  for: number; against: number; result: 'W' | 'D' | 'L'; availableMinutes: number | null; scorerGoals: number }
export type PlayerSeason = { squadPlayerId: string; apps: number; minutes: number | null; available: number | null;
  pct: number | null; goals: number; assists: number }
export function seasonSummary(rows: SeasonRow[]): { matches: SeasonMatch[]; players: PlayerSeason[];
  record: { w: number; d: number; l: number }; goalsFor: number; goalsAgainst: number;
  minutes: { lowest: number; highest: number; median: number } | null; matchesWithoutMinutes: number;
  running: { date: string; goalsFor: number; goalsAgainst: number; w: number; d: number; l: number }[];
  mismatches: SeasonMatch[] }

// availability.ts
export type AvailPlayer = { id: string; name: string; shirt: number | null; position: string | null }
export function splitAvailability(players: AvailPlayer[], consentPending: Set<string>, confirmed: Set<string>,
  reportedAbsent: Set<string>): { confirmed: (AvailPlayer & { absent: boolean })[];
  notConfirmed: (AvailPlayer & { absent: boolean })[]; notEligible: AvailPlayer[]; goalkeepers: AvailPlayer[] }
```

Rules the tests pin (from the spec):
- Movement compares a child's latest band with their own previous one, using the order of the `BANDS` array (index 0 = Exceptional, so up = a lower index).
- `nextSteps`: each drop with `missedLast4 >= 3` → `Talk to {name}: a drop and missed sessions.`; any other drop → `Check in with {name}.`; all rises together → `Tell {A}, {B} and {C} what they did well.` (`Tell {A} what they did well.` for one).
- A heatmap cell is the mean of that week's assessments to 1 dp, or `null`. `range` uses each child's latest value; `wide` when `max - min >= 5`. `trend` = last non-null week − first non-null week, or null when fewer than 2. `fallingWeeks` counts consecutive week-on-week drops back from the latest non-null week.
- Focus is the row with the lowest latest non-null average. The sentence follows `Lowest average ({avg}){, and falling for {n} weeks}. The range is {wide|narrow} ({min}–{max}){: a few children are carrying the rest.|.}`
- A match key is `${match_date}|${opponent ?? ''}`. `availableMinutes` = max non-null `minutes_played` on that match, or null. A player's `available` sums the `availableMinutes` of the matches they played that have both the match's and their own minutes recorded. `pct = round(minutes / available * 100)`, or null. `minutes` is the median, lowest and highest over the players with a pct. `matchesWithoutMinutes` counts matches whose `availableMinutes` is null. `running` is cumulative by date ascending. `mismatches` are matches where `scorerGoals !== for`.
- A goalkeeper is a confirmed player with `position === 'Goalkeeper'`.

- [ ] **Step 1: Write failing tests.** Use the mockup's figures where they apply:
  - `bandMoves`: Leo Steady→Mixed gives `move: -1`; Sami Standout→Exceptional gives `move: 1`; a single assessment gives `previous: null, move: 0`; a null `coach_rating` row is ignored.
  - `nextSteps`: Leo dropped with missed 3 → `'Talk to Leo M.: a drop and missed sessions.'`; Yusuf dropped with missed 0 → `'Check in with Yusuf A.'`; rises Sami, Omar, Ethan → `'Tell Sami R., Omar K. and Ethan P. what they did well.'`; empty input → `[]`.
  - `weekStarts('2026-10-21')` → `['2026-09-14','2026-09-21','2026-09-28','2026-10-05','2026-10-12','2026-10-19']`.
  - `attributeHeatmap`: an empty week → `null` and excluded from the trend; Tactical scores 2 and 8 → `range {min:2,max:8,wide:true}`; 6 and 9 → `wide:false`; Tactical weekly averages `5.6,5.4,5.3,5.2,5.0,5.1` → `trend -0.5`, `fallingWeeks 0`. Weekly averages `5.6,5.4,5.3,5.2,5.0` → `fallingWeeks 4`.
  - `focusAttribute` on mockup-like rows picks Tactical and returns `'Lowest average (5.1). The range is wide (2–8): a few children are carrying the rest.'`; empty rows → `null`.
  - `seasonWindow('2026-10-21')` → `{from:'2026-07-01', to:'2027-06-30', label:'Season 2026–27'}`; `seasonWindow('2027-03-01').label` → `'Season 2026–27'`.
  - `seasonSummary`: two players over two 48-minute matches, one 3–1 win and one 1–1 draw; a quick-logged match where all minutes are null → counted in record and apps, `matchesWithoutMinutes 1`, and excluded from `available`. Rayan with 138 minutes over 7 × 48 → `pct 41`. Player goals 2 against a team score of 3 → that match is in `mismatches`. No rows → `minutes: null`, `players: []`, `record {0,0,0}`.
  - `splitAvailability`: a confirmed child with a reported absence → in `confirmed` with `absent: true`; a consent-pending child → in `notEligible` only; goalkeepers come only from `confirmed`.
- [ ] **Step 2: Run the tests and see them fail.** `npx vitest run src/lib/squad`. Expected: FAIL with modules not found.
- [ ] **Step 3: Implement the four modules** to the signatures above. They are pure, with no Supabase import.
- [ ] **Step 4: Run the tests and see them pass.** `npx vitest run src/lib/squad`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(TRAK-250): squad snapshot, attribute, season and availability figures`

### Task 3: Shell page, shared reads and the old list's removal

**Files:**
- Rewrite: `src/pages/coach/CoachSquadPage.tsx` (keep the default export and the route in `App.tsx`)
- Create: `src/components/coach/squad/useSquadRoster.ts`, `src/components/coach/squad/SquadLoadError.tsx`
- Delete: `src/pages/coach/__tests__/squad-directory-trak182.test.tsx`, `squad-consent-status.test.tsx`, `squad-load-failure-refresh.test.tsx`, `squad-wait-player-trak177.test.tsx`
- Modify: `coach-two-squads-trak176.test.tsx`, `tab-switch-trak180.test.tsx`, `wait-reason-trak99.test.tsx`. Remove only their assertions about the old Squad list. Keep everything about Home, the schedule and saves. Check `src/__tests__/parked-feature-boundary.test.tsx` still passes, since `/coach/squad/add` still redirects to `/coach/squad`.
- Test: `src/pages/coach/__tests__/squad-views-trak250.test.tsx`

**Interfaces:**
- Produces:
  - `useSquadRoster(): { squad: string | null; squads: string[]; setSquad(s: string): void; players: Tables<'squad_players'>[]; consentPending: Set<string>; assessments: AssessmentRow[]; isPending: boolean; error: Error | null; retry(): void }`. Players are the coach's `squad_players` with `status <> 'coach_departed'`, filtered by `useCoachSquad(...).inSquad(age_group)`. Consent comes from the existing per-player `coach_squad_player_consent_required` RPC, and `true` puts the child in `consentPending`. Assessments come from `coach_assessments` with the six attribute columns, ordered by `created_at desc` and limited to this roster's ids. Query keys start `['coach', userId, 'squad-roster']`.
  - `<SquadLoadError onRetry />`: the existing WifiOff "Couldn't load your squad" block, moved here with the same copy.
  - Tab ids `'snapshot' | 'attributes' | 'availability' | 'season'`, read from `?tab=` (an unknown or missing value means `snapshot`). Changing tab uses `setSearchParams({ tab }, { replace: true })`.
- Consumes: Task 2 `AssessmentRow`.

Layout: `min-h-screen bg-ground pb-24`, then a content wrapper `mx-auto w-full max-w-[1280px] px-5 md:px-8`. The header row has `<h1>Squad</h1>`, a `role="tablist"` labelled "Squad views" whose four `role="tab"` buttons have an underline when selected (as the mockup's `.tabs`), the squad `SegmentedControl` when `squads.length >= 2`, and the coach `Avatar`. Each tab's panel is `role="tabpanel"`. The page ends with `<NavBar role="coach" …>`. There is no `MobileShell` and no `QuickAdd`.

- [ ] **Step 1: Write failing tests** in `squad-views-trak250.test.tsx`, using MSW `table(...)` like the deleted TRAK-182 test:
  - `opens on Snapshot and keeps the tab in the URL`: `renderApp('/coach/squad')` makes the Snapshot tab `aria-selected="true"`; clicking Season puts `?tab=season` in `window.location` and shows the Season panel; `renderApp('/coach/squad?tab=attributes')` opens Attributes.
  - `squad picker scopes every tab`: with U10 and U12 rows, picking U12 limits Snapshot names to U12, and the `coach_squad_season` request body carries `p_squad: 'U12'`.
  - `a failed roster read shows Try again`: `squad_players` returns 500, the page shows "Couldn't load your squad", and clicking "Try again" with a good response shows the tabs' content.
  - `the old directory is gone`: no searchbox named "Search players".
- [ ] **Step 2: Run the test and see it fail.** `npx vitest run src/pages/coach/__tests__/squad-views-trak250.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the shell and the hook, with temporary placeholder panels for the four tabs. Remove the TRAK-180 `remember('coach-squad', …)` use.
- [ ] **Step 4: Delete or trim the old tests** as listed under Files.
- [ ] **Step 5: Run the tests and see them pass.** `npx vitest run src/pages/coach src/__tests__/parked-feature-boundary.test.tsx`. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(TRAK-250): Squad becomes a tabbed coach workspace`

### Task 4: Snapshot tab

**Files:** Create `src/components/coach/squad/SnapshotTab.tsx`. Test: extend `squad-views-trak250.test.tsx`.

**Interfaces:** Consumes `useSquadRoster()`, `bandMoves`, `bandSpread`, `nextSteps`, `DROP_AFTER`. Missed trainings: this coach's last 4 `coach_sessions` with `session_type = 'training'` for the squad (session `squad` null or equal), plus their `session_attendance` rows. Count `status` values other than `'present'` per `squad_player_id`. Read `src/lib/attendance-rate.ts` for which statuses mean present.

UI, as mockup screen 3: subtitle `Latest band per child · {n} assessed · {m} not yet admitted`. A spread bar is a `flex` row of segments with `flex-grow` = count and the colour from `BANDS`. Seven band columns hold a `BandPill`, a count, and child chips with ↑/↓. A "Changes since last assessment" card lists moves, biggest first, as `BandPill → BandPill` with an "Open profile" button to `/coach/player/:id`. A "What the coach does next" card and a coach-only caption follow. Use `grid-cols-7` at `lg`, `grid-cols-4` at `md`, `grid-cols-2` below.

- [ ] **Step 1: Write failing tests.** `snapshot shows spread, moves and next steps`: given Leo with ratings 6.5 then 5.0 and Sami with 8.2 then 9.1, plus attendance showing Leo absent for 3 of the last 4, expect the Mixed column to contain "Leo M." with ↓, the Changes card to show Leo, an "Open profile" link to `/coach/player/sq-leo`, and the text `Talk to Leo M.: a drop and missed sessions.` `empty squad`: players but no assessments → `0 assessed` and the text `No assessments yet`.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/pages/coach/__tests__/squad-views-trak250.test.tsx -t snapshot`
- [ ] **Step 3: Implement `SnapshotTab`.**
- [ ] **Step 4: Run them and see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(TRAK-250): Snapshot tab`

### Task 5: Attributes tab

**Files:** Create `src/components/coach/squad/AttributesTab.tsx`. Test: extend `squad-views-trak250.test.tsx`.

**Interfaces:** Consumes `useSquadRoster().assessments`, `weekStarts`, `attributeHeatmap`, `focusAttribute`, `ATTRIBUTES`, `localTodayISO` and `localParts(iso).date` from `src/lib/event-time.ts`.

UI, as mockup screen 4: a table with the attribute name, 6 week cells (label `d MMM`), a Range cell (`min–max` with a `wide`/`narrow` caption) and a Trend cell (↑/↓ with the absolute value to 1 dp). Cell background is `rgb(var(--t-brand) / α)`, where α = clamp((v−4)/4.4, 0.08, 0.9). Text uses `--t-on-brand` when α > 0.5. A null cell shows `—` on `--t-raised`. The focus row has an outline. The aside holds "Focus this week" (attribute name, sentence, a button `Open Trainings →` to `/coach/trainings`), "How to read the range", and the coach-only callout. On `md` and below the table scrolls horizontally inside its card, never the page.

- [ ] **Step 1: Write failing tests.** `attributes heatmap and focus`: assessments across two weeks where Tactical is lowest → the Tactical row shows its weekly values, an empty week shows `—`, the Focus card's heading is "Tactical", and the button links to `/coach/trainings`. `empty squad` → `No assessments in the last 6 weeks`.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/pages/coach/__tests__/squad-views-trak250.test.tsx -t attributes`
- [ ] **Step 3: Implement `AttributesTab`.**
- [ ] **Step 4: Run them and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(TRAK-250): Attributes tab`

### Task 6: Season tab

**Files:** Create `src/components/coach/squad/SeasonTab.tsx` and `src/components/coach/squad/useSeason.ts`. Test: extend `squad-views-trak250.test.tsx`.

**Interfaces:** Produces `useSeason(): { window: ReturnType<typeof seasonWindow>; summary: ReturnType<typeof seasonSummary> | undefined; isPending; error; retry }`, which calls `supabase.rpc('coach_squad_season', { p_from, p_to, p_squad: squad })` with query key `['coach', userId, 'season', squad, from]`. Consumes `seasonWindow`, `seasonSummary`, `useSquadRoster().players` for names and numbers.

UI, as mockup screen 6. The heading is `window.label`, with the sub-line `{n} matches`, plus `· {k} without minutes, not counted` when k > 0. Four tiles: Played, Won · drawn · lost, Goals for – against, and Minutes balance (`lowest% → highest%`, `median {m}%`, or `—`). Below them, a recharts `LineChart` titled "How the season built up" with cumulative goals for and against by match date. Lines use `--t-brand` and `--t-ink-3`, and the chart has an `aria-label`. When `mismatches` is non-empty, a warning callout reads `Numbers don't add up: player goals total {x}, match scores total {y}.` and names each match (`{d MMM} vs {opponent}`), linking to `/coach/sessions/{sessionId}` or `/coach/sessions/list`. The player table is sorted by `pct` ascending (nulls last). Names link to the profile. A `minutes owed` chip shows under 50%, and the bar uses `--t-warning` when low. The Results list is newest first, with W/D/L chips.

- [ ] **Step 1: Write failing tests.**
  - `season builds up from logged matches`: three matches mocked through `rpc/coach_squad_season` → tiles `3`, `2 · 0 · 1`, `7 – 4`; a player with 41% shows `minutes owed`; a match without minutes shows `1 without minutes, not counted`; a mismatch callout links to `/coach/sessions/s-2`.
  - `empty season`: `[]` → `No matches logged this season yet`, and no tiles show `0%`.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/pages/coach/__tests__/squad-views-trak250.test.tsx -t season`
- [ ] **Step 3: Implement `useSeason` and `SeasonTab`**.
- [ ] **Step 4: Run them and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(TRAK-250): Season tab built up from the coach's match logs`

### Task 7: Availability tab

**Files:** Create `src/components/coach/squad/AvailabilityTab.tsx`. Test: extend `squad-views-trak250.test.tsx`.

**Interfaces:** Consumes `useSquadRoster()`, `splitAvailability`, `useSeason()` from Task 6 (for `pct` and Minutes owed), and the Task 1 RPCs. Reads:
- Events: `coach_calendar_events` with `coach_user_id = me`, `published = true`, `status <> 'cancelled'`, `starts_at >= start of today`, ordered by `starts_at`, limit 10. Then client-side `squad == null || squad === selected`. A previous/next pair of buttons steps through them.
- `event_confirmations` and `event_absences` for the shown `event_id`, selecting only `squad_player_id`. Never select `reason`.
- Toggle: `supabase.rpc('confirm_event_attendance' | 'unconfirm_event_attendance', { p_event_id, p_squad_player_id })`, then invalidate the confirmations query. On error, show `role="alert"` with the error's message and leave the row in place.

UI, as mockup screen 5 with two columns. The header has a type chip, `{Ddd d MMM} · vs {opponent}` (or the title for training) and a mono line with time, home/away and venue, each only when present. Confirmed and Not confirmed cards each have a count chip. Each row is a `button` with `aria-pressed` and min-height 44, showing the shirt number, name, position, `{pct}%` for matches, and a `Reported can't make it` tag when absent. A Not eligible warning callout lists consent-pending names. The aside holds a squad card (`{n} confirmed · {m} not confirmed`, `Goalkeepers: …` or the warning `No goalkeeper confirmed`), Minutes owed (matches only), and the callout `Confirmations come from your WhatsApp group; families don't see them in Trak.`

- [ ] **Step 1: Write failing tests.**
  - `availability splits confirmed and not confirmed`: one event, a confirmation for c1 and an absence for c2 → c1 in Confirmed, c2 in Not confirmed with `Reported can't make it`, and no reason text rendered even when the mock row has `reason: 'Dentist'`.
  - `tapping a child confirms them`: clicking c3 posts to `rpc/confirm_event_attendance` with `{p_event_id, p_squad_player_id:'c3'}`. With the refetch mocked to include c3, c3 moves to Confirmed.
  - `a refused confirm stays put`: the RPC returns 403 `{message:'This event has ended'}` → an alert with that text, and c3 stays in Not confirmed.
  - `no upcoming event`: no events → `No upcoming events` and a link to `/coach/schedule`.
  - `consent-pending child is not eligible`: they appear only in the Not eligible callout, with no toggle button.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/pages/coach/__tests__/squad-views-trak250.test.tsx -t availability`
- [ ] **Step 3: Implement `AvailabilityTab`.**
- [ ] **Step 4: Run them and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(TRAK-250): Availability tab with coach-marked confirmations`

### Task 8: Local 3-month demo seed, registry and README

**Files:**
- Create: `supabase/seeds/squad_views_demo.sql`
- Modify: `docs/use-cases/registry.yaml` (add `UC-E11`), then regenerate with `npm run uc:report` (`docs/use-cases/README.md`)
- Modify: `README.md` (one short "Squad views demo (local only)" subsection under Local Setup)

Seed rules:
- Guard first. Raise unless `current_setting('trak.dev_password', true)` is non-empty **and** `current_setting('trak.local_demo', true) = 'yes'`. The header explains both settings, and says it is for a local `npx --yes supabase@latest start` stack, never the shared project.
- It is idempotent: fixed UUIDs under a `5e250000-…` prefix, and `ON CONFLICT DO NOTHING`.
- Model the accounts, consent and admission rows on `supabase/seeds/dev_data.sql` and the fixtures in `supabase/tests/roster_admission.sql`, so that `coach_squad_player_consent_required` is false for 12 children and true for Hamza Q. Contents:
  - Rehearsal FC organisation, with `academy_features` events on.
  - Coach "Rami A.", who logs in as `coach.squad-demo@` on the domain from `scripts/synthetic-domain.mjs`.
  - 13 U10 children with the mockup's names, numbers and positions: Zayd B. and Adam H. are goalkeepers; Hamza Q. is consent pending.
- Data from 22 Jul to 21 Oct 2026, with dates generated by `generate_series`:
  - Trainings on Tue and Thu: `coach_sessions` plus `session_attendance`. Leo misses 3 of the last 4, and Elias misses 2 of the last 4.
  - Saturday matches with scores, written through `log_match_for_player` while acting as the coach (`set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated`) so `logged_by` is stamped exactly as in production. One match has a missing scorer. One quick log has `p_minutes_played => NULL`. Rayan ends near 41% of minutes.
  - Assessments every 1–3 weeks per child, inserted the same way. The trends: Tactical drifting from about 5.6 to about 5.1 with a 2–8 spread; Leo Steady→Mixed; Yusuf Good→Steady; Sami Standout→Exceptional; Omar Good→Standout; Ethan Mixed→Steady.
  - Published future events: a training on Thu 22 Oct 17:00 and a match on Sat 24 Oct 09:30 vs Marina FC U10. Confirmations for 8 children. A `report_cant_make_it` for Leo, called as his guardian.
- Registry `UC-E11`: `actor: coach`, title `Mark each child Confirmed for an event from the squad's WhatsApp replies`, `requirement: J8`, `status: pending`, `tier: [2]`, `spec_version: 1`, given/when/then from the spec's Availability section, `source: TRAK-250`. Follow the `uc:lock` rules in `AGENTS.md` and run `npm run uc:check`.

- [ ] **Step 1: Start the local stack.** `npx --yes supabase@latest start`, then `npx --yes supabase@latest db reset`. Expected: every migration applies, including the Task 1 migration.
- [ ] **Step 2: Run the seed.** Use psql against the local DB: `SET trak.dev_password = '<fresh local value>'; SET trak.local_demo = 'yes'; \i supabase/seeds/squad_views_demo.sql`. Expected: no error. A rerun is a no-op, and running without `trak.local_demo` raises.
- [ ] **Step 3: Check the seeded figures.** Run `SELECT count(*) FROM coach_sessions` (about 26 trainings and about 12 matches) and `coach_squad_season(...)` as the coach via claims. Expected: rows for 12 children, Hamza absent.
- [ ] **Step 4: Update the registry and README.** Run `npm run uc:report && npm run uc:check`. Expected: exit 0.
- [ ] **Step 5: Commit.** `chore(TRAK-250): local-only 3-month squad demo seed and UC-E11`

### Task 9: Verify in the browser and open the PR

**Files:** `.env.local` (git-ignored) pointing at the local stack's URL and publishable key, with `VITE_DEV_PASSWORD` set to the seed's local value.

- [ ] **Step 1: Run the checks.** `npm run typecheck && npm run lint && npx vitest run src`. Expected: exit 0.
- [ ] **Step 2: Start the app.** `preview_start` with `trak-dev`, sign in as the demo coach and open `/coach/squad` at 1280×900 and at 768×1024. On each tab, check that the read_page content matches the seeded story: the Snapshot moves, Tactical as the focus, the Saturday split with Leo tagged, and the Season tiles with the mismatch callout. Then confirm and unconfirm a child. Check the console has no errors. Take one screenshot per tab at 1280.
- [ ] **Step 3: Close out DOX.** Root `AGENTS.md`: add one line to "Data and UI conventions": "Availability confirmations are coach-marked from the squad's WhatsApp group (`event_confirmations`, TRAK-250); families never read them." Under "Find the implementation", add a row for the Squad views pointing at `src/components/coach/squad/`.
- [ ] **Step 4: Push and open the PR.** `git push -u origin dimos/trak-250-squad`, then open a draft PR with the title from Global Constraints. The body covers the behaviour summary, the TRAK-250 link, known limits (no WhatsApp reading, no "need N", season = 1 Jul–30 Jun), and the screenshots. Mark it ready once complete, so the merge gate runs CI.
