# Design standard, step 3: the Squad page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the coach's Squad page (`/coach/squad`, Players and Formations) on the standard's shared pieces, so it looks like the Season plan mockup: a titled header with the squad's size, section labels, cards with status pills, a number block for the locked state.

**Architecture:** No new data, routes or behaviour. Each view keeps its hooks and handlers; only its markup moves onto `SectionLabel`, `SectionCard`, `StatusPill` and `NumberBlock` (`@/components/trak/standard`, step 1) and the header onto `PageTop`'s `subtitle` (step 1). The Players list is Arc's `SquadDirectory` block, restyled in its CSS module; the player page is `PlayerProfile`.

**Tech Stack:** React 18 + TypeScript, Tailwind with role tokens, Arc CSS modules, i18next (English and Greek), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-24-trak-design-standard-design.md`, section 6 (and sections 1–4 for the pieces).

## Global Constraints

- Stacked on step 2 (`dimos/design-standard-frame`), which is stacked on step 1 (#776). Branch `dimos/design-standard-squad`.
- Use the shared pieces; no one-off sizes, no colours outside the tokens.
- Words come from the locale files; every new key goes in `src/locales/en/coachSquad.json` **and** `src/locales/el/coachSquad.json` (`squad-greek-trak407.test.ts` guards Squad's Greek).
- No behaviour changes: the same buttons, handlers, URLs (`?tab=`, `?formation=`), confirmations, toasts and accessible names, except the heading changes listed in Tasks 4–5.
- Heading order on the page: `h1` Squad (PageTop) → `h2` section labels → `h3` card titles → `h4` inside a card.
- The existing tests in `src/components/coach/squad/formations/__tests__`, `src/lib/squad/__tests__` and `phone-back-trak498` stay green.
- One PR, `TRAK-<n> [design] Design standard step 3: Squad page`, opened as **draft** until steps 1 and 2 are in `main`.

## Review Focus

1. **Greek.** New words, and the Greek layout of the header and pills (longer words). Expected: every new key has a Greek value; pills wrap or truncate, never overflow. Task 1 and Task 5 tests use the Greek words.
2. **A player waiting for consent.** Their row and page must still say so, in words. Expected: a needs-tone pill "Waiting for consent" on the row and the page. Tasks 2–3 pin it.
3. **Unsaved formation state for a screen reader.** The status line was a `role="status"` paragraph. Expected: the pill sits inside the same live region, so "Unsaved changes" / "All changes saved" is still announced. Task 4 pins it.
4. **All squads selected.** The header has no single squad. Expected: no subtitle (not "All squads · 41 players"). Task 1 pins it.
5. **A squad with nobody placed / everybody placed.** The locked Formations card's number block. Expected: "0 / 15" with an empty bar, never "NaN"; the card only shows while someone is unplaced. Task 5 pins both ends.

---

### Task 1: The Squad header

**Files:**
- Modify: `src/pages/coach/CoachSquadPage.tsx` (the `PageTop` at ~L76)
- Create: `src/lib/squad/subtitle.ts`
- Test: `src/lib/squad/__tests__/squad-subtitle.test.ts`

**Interfaces:**
- Produces: `squadSubtitle(squad: string | null, count: number, t: TFunction): string | null` → `"U16 · 15 players"` using `t('coachMatches:playersCount', { count })`; `null` when `squad` is null.

- [ ] **Step 1: Write the failing tests:** `names the squad and its size` (`'U16', 15` → `'U16 · 15 players'`); `one player is singular` (`'U16', 1` → `'U16 · 1 player'`); `no subtitle with All squads` (`null, 41` → `null`); `Greek` (with i18n switched to `el`, the count words come from `el/coachMatches.json`'s `playersCount_*`).
- [ ] **Step 2: Run** `npx vitest run src/lib/squad/__tests__/squad-subtitle.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the helper; in `CoachSquadPage` pass `subtitle={squadSubtitle(squad, playersInSquad, t)}`, where `squad = roster.squad ?? (roster.squads.length === 1 ? roster.squads[0] : null)` and `playersInSquad` counts `roster.players` whose `age_group?.trim() === squad`.
- [ ] **Step 4: Run** the test and `src/lib/squad/__tests__` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Squad's header names the squad and its size (TRAK-<n>)`

### Task 2: The Players list, grouped by line, without sparklines

Dimos (24 Nov): the players are grouped from Attackers down to Goalkeepers, each group a cluster of its own, and the
performance graph (the ratings sparkline) beside each player goes.

**Files:**
- Modify: `src/components/arc/blocks/team-directory/squad-directory.tsx` (`SquadPlayer`, `FILTERS`, the list render ~L102–124, `BandChip`, header) and `squad-directory.module.css`
- Modify: `src/components/coach/squad/PlayersTab.tsx` (drop `trends`/`TREND` and the `trend` field)
- Modify: `src/locales/en/coachSquad.json`, `src/locales/el/coachSquad.json` (new keys below)
- Test: `src/components/arc/__tests__/squad-directory-standard.test.tsx` (new)

**Interfaces:**
- Produces: `export const GROUP_ORDER = ['ATT', 'MID', 'DEF', 'GK'] as const` from `squad-directory.tsx`; players with `group: null` (no position yet) form a last group. `SquadPlayer` loses `trend`.
- New locale keys (en / el): `groupATT` "Attackers" / "Επιθετικοί", `groupMID` "Midfielders" / "Μέσοι", `groupDEF` "Defenders" / "Αμυντικοί", `groupGK` "Goalkeepers" / "Τερματοφύλακες". The no-position group reuses `noPositionYet`. Dimos to confirm the Greek in review.

- [ ] **Step 1: Write the failing tests** (render `SquadDirectory`, title "U16 players", with players: Kai (ATT), Liam (MID), Owen (DEF), Noah (GK), Toby (ATT), Sam (no position)):
  - `groups players from Attackers down to Goalkeepers`: the `h3` group headings read, in order, "Attackers 2", "Midfielders 1", "Defenders 1", "Goalkeepers 1", "No position yet 1"; each group is its own `<section aria-labelledby>` with its own list; Kai and Toby are in the Attackers list, in shirt order then name.
  - `an empty group is left out`: with no defenders, there is no "Defenders" heading.
  - `the position filter shows one group`: choosing MID shows only the Midfielders group; the filter's options read All, ATT, MID, DEF, GK (the same top-down order).
  - `search keeps the groups`: typing "o" shows Toby under Attackers, Owen under Defenders, Noah under Goalkeepers, and hides groups with no match.
  - `no rating graph beside a player`: no `figure`/sparkline inside any row, even when the old `trend` data would have been there; `PlayersTab.tsx` no longer contains `Sparkline`, `trend` or `TREND`.
  - `group labels in the standard style, Greek present` (Review Focus 1): group headings use `SECTION_LABEL` classes with the count in `tabular-nums`; `el/coachSquad.json` has non-empty `groupATT`…`groupGK`.
  - `the list's title is a card title`: CSS `.header h2` `font-size: 20px; font-weight: 700`; the total count stays beside it.
  - `search is 44 px tall`: CSS `.search` `height: 44px`.
  - `a name reads at 15 px semibold`: CSS `.personName` `font-size: 15px; font-weight: 600`.
  - `a player waiting for consent says so in a needs pill` (Review Focus 2): the chip text "Waiting for consent" with `data-tone="needs"`; CSS `.chip[data-tone="needs"]` uses `var(--warning)` text, `color-mix(in oklab, var(--attention) 10%, transparent)` background, `color-mix(in oklab, var(--attention) 25%, transparent)` edge.
- [ ] **Step 2: Run** `npx vitest run src/components/arc/__tests__/squad-directory-standard.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Group the filtered, searched players by `GROUP_ORDER` then the null group; each group a `section` with an `h3` in `SECTION_LABEL` style ("Attackers" + count) and its own `ul` of the existing rows, groups 24 px apart inside the card. Reorder `FILTERS` to All, ATT, MID, DEF, GK. Remove the sparkline from the row and `trend` from `SquadPlayer` and `PlayersTab`; the row keeps its flag (Watching, Due, Draft) and the waiting chip. `BandChip` gets `data-tone` (`needs` waiting, `neutral` not assessed; banded chips keep `BANDS` colours). The `lastRatings` key becomes unused and stays in the locale files.
- [ ] **Step 4: Run** it, `src/components/arc/__tests__` and `src/lib/squad/__tests__/squad-greek-trak407.test.ts` — Expected: PASS apart from `arc-portals-trak220` (fails on `main`).
- [ ] **Step 5: Commit** `feat: Players grouped from Attackers to Goalkeepers, without the ratings graph (TRAK-<n>)`

### Task 3: A player's page

**Files:**
- Modify: `src/components/coach/squad/PlayerProfile.tsx` (`TITLE` at L32, the header at ~L96–103, the waiting early return at L107)
- Test: `src/components/coach/squad/__tests__/player-profile-standard.test.tsx` (new)

**Interfaces:**
- Consumes: `SECTION_LABEL`, `StatusPill` (step 1).

- [ ] **Step 1: Write the failing tests** (render `PlayerProfile` with `player.waiting = true`, which returns before any data is read; and source checks for the rest):
  - `the player's name is a card title`: the `h3` has `text-xl font-bold tracking-[-0.01em]`.
  - `a waiting player shows a needs pill` (Review Focus 2): text "Waiting for consent" inside a `StatusPill` (`text-warning`), followed by the existing waiting sentence.
  - `the page's sections are labelled in the standard style`: `PlayerProfile.tsx` imports `SECTION_LABEL` and `TITLE` equals it (the `h4`s "About Sam", "Assessments", "Position and roles" keep their level).
- [ ] **Step 2: Run** `npx vitest run src/components/coach/squad/__tests__/player-profile-standard.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**: `const TITLE = SECTION_LABEL`; header `h3` classes; the waiting branch renders `{header}<StatusPill tone="needs">{t('coachSquad:waitingForConsent')}</StatusPill><p …>`.
- [ ] **Step 4: Run** it and `src/pages/coach/__tests__/assess-open-saved-j5.test.tsx`, `phone-back-trak498` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: a player's page in the standard's type and pills (TRAK-<n>)`

### Task 4: Formations, the saved list and the editor card

**Files:**
- Modify: `src/components/coach/squad/formations/FormationsTab.tsx` (`header` ~L113–120, the saved list ~L222–234, the editor `<section aria-labelledby="formation-name">` ~L236–296)
- Test: `src/components/coach/squad/formations/__tests__/formations-standard.test.tsx` (new)

**Interfaces:**
- Consumes: `SectionLabel`, `SectionCard`, `StatusPill` (step 1).

Test set-up: as `formations-squad-select-trak562.test.tsx`, plus `vi.mock` of `./useFormations` (`useFormations` → `{ data: [F], isError: false, refetch }` with `F = { id: 'f1', name: 'Saturday 4-3-3', format: 11, shape: '4-3-3', starters: {}, isDefault: false, copies: [] }`; `useFormationWrites` → each of `save`, `start`, `use`, `undoCopy`, `setDefault`, `remove` as `{ mutate: vi.fn(), isPending: false }`; `refusal` → `() => null`) and of `../usePlayerRoles` (`{ of: () => ({ also: [] }), isPending: false, isError: false, refetch }`); a roster for squad U16 with two consented players who have positions.

- [ ] **Step 1: Write the failing tests:**
  - `the saved list sits under a "Saved formations" label with New on its right`: heading level 2 "Saved formations" (`coachSquad:fmSavedList`); a button "New formation" (existing `fmNew` text) in the same row; the old "Your matchday playbook" heading is gone (its words stay in the locale file, unused keys are allowed).
  - `the formation in view is a card titled with its name`: region named "Saturday 4-3-3", heading level 3; Rename button still beside it.
  - `its saved state is a pill in a live region` (Review Focus 3): `getByRole('status')` contains a `StatusPill` with text "All changes saved" (`text-success`).
  - `Delete and Set for matchday sit in the card's footer`: the Delete button is after a `border-line-soft` divider inside the region.
  - `the default badge is a neutral pill`: with `isDefault: true`, text from `fmDefaultBadge` inside a `bg-raised` pill.
- [ ] **Step 2: Run** `npx vitest run src/components/coach/squad/formations/__tests__` — Expected: the new file FAILS; `trak562` passes.
- [ ] **Step 3: Implement.** The `header` becomes `<SectionLabel action={<Button variant="secondary">…New</Button>}>{t('coachSquad:fmSavedList')}</SectionLabel>`; the saved list drops its `aria-label` (the label now names it via `aria-labelledby`). The editor becomes `<SectionCard title={<>{current.name}<rename button/></>} pill={<span role="status"><StatusPill …/></span>} action={<Discard/Save/>} footer={<Set for matchday + Delete/>}>` with the alerts, the use/default row, the format picker and `FormationBoard` as children. Unsaved → `tone="needs"` with `fmUnsaved`.
- [ ] **Step 4: Run** the formations tests and `src/lib/squad/__tests__/formation-board-trak357.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Formations on the standard's label, card and pills (TRAK-<n>)`

### Task 5: Formations, the locked state

**Files:**
- Modify: `FormationsTab.tsx` (the `unplaced > 0` return, ~L104–108)
- Modify: `src/locales/en/coachSquad.json`, `src/locales/el/coachSquad.json` (new key `fmPlacedCaption`: en `"players placed"`, el `"παίκτες τοποθετημένοι"` — Dimos to confirm the Greek in review)
- Test: `formations-standard.test.tsx` (extend)

**Interfaces:**
- Consumes: `SectionCard`, `NumberBlock`.

- [ ] **Step 1: Write the failing tests:**
  - `a squad with players to place shows how many are placed`: 2 of 3 consented players placed → region named by `fmPlaceToOpen` ("Place 1 player to open Formations"), `NumberBlock` "2 / 3" with caption "players placed" and a progress bar at 67 in the needs tone, and the existing "Go to Positions" button.
  - `nobody placed reads 0 / N with an empty bar` (Review Focus 5): 0 of 3 → "0 / 3", `aria-valuenow="0"`.
  - `everyone placed opens Formations` (Review Focus 5): 3 of 3 → no locked card; the saved list shows.
  - `Greek has the caption` (Review Focus 1): `el/coachSquad.json` has a non-empty `fmPlacedCaption`.
- [ ] **Step 2: Run** the formations tests — Expected: FAIL.
- [ ] **Step 3: Implement**: `SectionCard title={t('coachSquad:fmPlaceToOpen', { count: unplaced })}` with `NumberBlock value={`${placed} / ${consented.length}`} caption={t('coachSquad:fmPlacedCaption')} progress={consented.length ? placed / consented.length : 0} tone="needs"`, the existing `fmNeedsPosition` sentence and the Positions button.
- [ ] **Step 4: Run** the formations tests and `src/lib/squad/__tests__/squad-greek-trak407.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: locked Formations shows how many players are placed (TRAK-<n>)`

### Task 6: Final candidate

- [ ] **Step 1:** `npx vitest run src` — only the files that fail on unchanged `main` on Windows; `npm run build` exit 0.
- [ ] **Step 2:** Whole-branch review by a fresh reviewer with this plan's Review Focus; fix Critical/Important each with a failing test first.
- [ ] **Step 3:** Push to `fork`; open the PR as **draft** (depends on #776 and the step 2 PR), screenshots of Players, a player page and Formations from the PR preview, body ending with the Claude Code line.
