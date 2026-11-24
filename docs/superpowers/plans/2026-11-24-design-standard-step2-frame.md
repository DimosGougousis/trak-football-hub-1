# Design standard, step 2: the coach frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the laptop frame to the mockup: a 192 px rail that folds to 68 px and remembers it, 44 px rows, the squad picker as a compact pill, and a 64 px top bar with the trail, an outlined bell and a near-black "+ Create".

**Architecture:** The frame is Arc's `SidebarRail` block (`src/components/arc/blocks/sidebar-rail/`), wrapped by `CoachFrame`. It already folds (240/64 px), shows tooltips when folded, and has the top bar with trail and actions. This step changes its sizes and styles, adds an opt-in remembered fold, and gives Arc's `TeamSwitcher` a compact size. The phone keeps its glass tab bar; its menu sheet reuses the rail's row styles, so it follows automatically.

**Tech Stack:** React 18 + TypeScript, Arc CSS modules, Motion, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-24-trak-design-standard-design.md`, section 5 (and sections 1–4 for tokens and type, built in step 1).

## Global Constraints

- Builds on step 1 (branch `dimos/design-standard`, PR #776): tokens `--t-rail`, `--t-line-soft`, Inter, 44 px controls. Branch `dimos/design-standard-frame` is cut from it.
- Colours from tokens only. Inside Arc CSS use Arc's bridged variables (`arc-theme.css`), never `--t-*` directly except where a bridge is added in this plan.
- Laptop rail: **192 px open, 68 px folded**. Rows **44 px**, **12 px** corners, **18 px** icons, **14 px** text; current row `ink/8` fill, `ink` text, semibold; other rows `ink-2`, `ink/5` on hover.
- Top bar: **64 px**, sticky, white at 95% with a blur, `line-soft` hairline under it.
- Every tappable thing at least 44 px.
- Phone and tablet below the side-menu width: unchanged behaviour (glass tab bar with "+", avatar opens the rail as a sheet).
- No route, word or permission changes. Existing tests `sidebar-rail-keeps-page-trak301` and `coach-frame-trak259` stay green.
- One PR titled `TRAK-<n> [design] Design standard step 2: coach frame` (issue number from Dimos). It contains step 1's commits until #776 merges: open it as **draft** and mark ready only after #776 is in `main`.

## Review Focus

1. **The family frame changes too.** `FamilyFrame` (player and parent, laptop) uses the same `SidebarRail`. Expected: it takes the same new rail (one standard), with no remembered fold unless it passes a key. Task 1's test renders the rail without a key.
2. **A remembered fold on a narrow window.** A coach folds the rail on a wide screen, then opens a mid-width window (under 760 px), or unfolds on a mid-width one. Expected: below 760 px the rail still starts folded as today; the remembered choice applies only where the rail would start open. Task 2 pins both.
3. **Full-height pages under a taller top bar.** Pages that fill the window (`min-h-screen`, `h-dvh`, the Trainings frame) assume 60 px. Expected: no double scrollbar, nothing cut off at the bottom. Task 3 pins the offsets.
4. **"+ Create" in Greek.** The button is as wide as its word (`useTopButtonWidth`, TRAK-406). Expected: still fits at 44 px tall with the new weight. Task 4's test uses the Greek word.
5. **The squad pill with a long squad name or All squads.** Expected: one line, truncated with an ellipsis, chevron always visible. Task 5 pins truncation.

---

### Task 1: Rail sizes and rows

**Files:**
- Modify: `src/components/arc/blocks/sidebar-rail/sidebar-rail.tsx` (constants `FULL`/`RAIL` at L12–13; `NavRow` icon size at L105)
- Modify: `src/components/arc/blocks/sidebar-rail/sidebar-rail.module.css` (`.shell`/`.sheetLayer` variables, `.brand`, `.profile`, `.item`, `.highlight`, `.icon`, `.label`, `.nested`)
- Modify: `src/components/arc/arc-theme.css` (Trak bridge: add `--surface-rail: rgb(var(--t-rail));`)
- Test: `src/components/arc/__tests__/sidebar-rail-standard.test.tsx` (new)

**Interfaces:**
- Produces: `export const RAIL_WIDTH = { open: 192, folded: 68 } as const` from `sidebar-rail.tsx`, replacing `FULL`/`RAIL` inside the file.

- [ ] **Step 1: Write the failing tests:**
  - `reports 192 px open and 68 px folded`: render `SidebarRail` (laptop, no `narrow`) with `onWidthChange` spy; expect last call `192`; click the button named "Collapse sidebar"; expect last call `68`. (Use the render set-up from `sidebar-rail-keeps-page-trak301.test.tsx`.)
  - `draws rows to the standard`: read the CSS module text; `.item` has `height: 44px`, `border-radius: 12px`, `font-size: 14px`; `--row-active` mixes `var(--foreground) 8%`; `--row-hover` mixes `var(--foreground) 5%`; `--rail: var(--surface-rail)` in both `.shell` and `.sheetLayer`; `.item[aria-current="page"]` sets `font-weight: 600` and `color: var(--foreground)`.
  - `draws 18 px icons`: the rendered Home row's `svg` has `width="18"`.
  - `brand and profile rows are 64 px`: CSS `.brand` and `.profile` `height: 64px`.

- [ ] **Step 2: Run them and see them fail**
Run: `npx vitest run src/components/arc/__tests__/sidebar-rail-standard.test.tsx`
Expected: FAIL (240, 32 px rows, 16 px icons).

- [ ] **Step 3: Implement.** Constants via `RAIL_WIDTH`; CSS values above; `.nested` rows 40 px; the folded dot (`.dot`) re-centred for the 68 px rail (`left` follows the new padding); `--surface-rail` bridge line in `arc-theme.css`.

- [ ] **Step 4: Run them and the rail's existing test**
Run: `npx vitest run src/components/arc/__tests__/sidebar-rail-standard.test.tsx src/components/arc/__tests__/sidebar-rail-keeps-page-trak301.test.tsx src/components/coach/__tests__/coach-frame-trak259.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit** `feat: the side rail at the standard's sizes (TRAK-<n>)`

### Task 2: Remember the fold

**Files:**
- Modify: `sidebar-rail.tsx` (`SidebarRailProps`, the `collapsed` state, the `ROOMY` effect at ~L191–206, `toggle` at ~L213)
- Modify: `src/components/coach/CoachFrame.tsx` (pass the key)
- Test: `src/components/arc/__tests__/sidebar-rail-standard.test.tsx` (extend)

**Interfaces:**
- Produces: optional prop `foldKey?: string` on `SidebarRail`. When set, the rail reads `localStorage[foldKey] === '1'` as "folded", and writes `'1'`/`'0'` when the person toggles. `CoachFrame` passes `foldKey="trak.coach.railFolded"`.

- [ ] **Step 1: Write the failing tests:**
  - `remembers a fold across visits`: render with `foldKey="t.fold"`, click Collapse, unmount, render again → last `onWidthChange` is `68` and `localStorage.getItem('t.fold') === '1'`.
  - `opens again when unfolded`: same, click Expand → `'0'`, re-render → `192`.
  - `without a key, starts open and stores nothing` (Review Focus 1): no `foldKey` → `192`, `localStorage.length === 0` after a toggle.
  - `a mid-width window still starts folded` (Review Focus 2): stored `'0'`, shell width 700 (mock `clientWidth`) → `68`.

- [ ] **Step 2: Run and see them fail** — same command as Task 1 Step 2. Expected: FAIL.

- [ ] **Step 3: Implement.** Initial `collapsed` = stored value when `foldKey` is set and the shell is roomy; the `ROOMY` effect's "opens when roomy" branch respects a stored fold; only person-initiated toggles write. Guard `localStorage` access with try/catch (private mode).

- [ ] **Step 4: Run and see them pass** — same command. Expected: PASS.

- [ ] **Step 5: Commit** `feat: the side rail remembers a coach's fold (TRAK-<n>)`

### Task 3: The 64 px top bar

**Files:**
- Modify: `sidebar-rail.module.css` (`.topbar`, `.iconButton`, `.crumbs*`, `.content :global(...)` at L69–71)
- Modify: `src/index.css` (`:root[data-layout="coach"] .trak-trainings-frame` height, L317)
- Test: `src/components/arc/__tests__/sidebar-rail-standard.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests** (CSS text):
  - `.topbar` has `height: 64px`, `border-bottom: 1px solid var(--border-subtle)`, background `color-mix(in oklab, var(--background) 95%, transparent)` and a `backdrop-filter` blur.
  - `.iconButton` is `44px` square with `border-radius: 12px`.
  - `.crumbs` `font-size: 14px`; `.crumbs .crumbCurrent` `font-weight: 600`.
  - Full-height offsets use 64: `.content :global(.min-h-screen)` → `calc(100vh - 64px)`, `.h-dvh` → `calc(100dvh - 64px)`; `index.css` Trainings frame → `calc(100dvh - 169px)` (Review Focus 3).

- [ ] **Step 2: Run and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the values; update the TRAK-417 comment to say 64 px.
- [ ] **Step 4: Run and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: the laptop top bar at 64 px (TRAK-<n>)`

### Task 4: Bell and "+ Create" in the top bar

**Files:**
- Modify: `src/components/arc/notification-center/*.module.css` (`.trigger`: 44 px)
- Modify: `src/components/coach/QuickAdd.tsx` (`CoachCreate`, `placement === 'top'`: height 44, icon `text-on-brand`)
- Modify: `src/components/arc/action-morph/action-morph.module.css` (closed top button: `.root[data-anchor="top"][data-view="fab"] .shape` filled `var(--accent)`, text `var(--accent-foreground)`, semibold)
- Test: `src/components/coach/__tests__/frame-top-actions-standard.test.tsx` (new)

- [ ] **Step 1: Write the failing tests:**
  - `the bell is a 44 px outlined square`: notification-center CSS `.trigger` `width: 44px; height: 44px`, keeps `border: 1px solid var(--border)`. (Its count badge stays: it says how many, which the mockup's dot does not.)
  - `Create is a main button at the top`: render `CoachCreate placement="top"` (mocks as in `quick-add-trak182.test.tsx`); its root `style.height` is `44px`; the plus icon has `text-on-brand`; action-morph CSS has the filled top rule above.
  - `Create fits its Greek word` (Review Focus 4): with the language set to Greek, the root's width ≥ the `useTopButtonWidth` result for "Δημιουργία" and the label is one line (`white-space: nowrap` in the face CSS).

- [ ] **Step 2: Run and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Open (morphed) Create keeps its current panel look; only the closed button fills.
- [ ] **Step 4: Run them and `quick-add-trak182`, `bell-says-it-once-trak226`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: the bell and Create at the standard's size and look (TRAK-<n>)`

### Task 5: The squad pill

**Files:**
- Modify: `src/components/arc/team-switcher/team-switcher.tsx` and `team-switcher.module.css`
- Modify: `src/components/coach/SquadSwitcher.tsx` (pass `size="compact"`; the plan line becomes the count only, "15")
- Test: `src/components/coach/__tests__/squad-pill-standard.test.tsx` (new)

**Interfaces:**
- Produces: `TeamSwitcher` prop `size?: 'default' | 'compact'`. Compact: trigger 44 px tall, one line "`{name} · {plan}`", 28 px tile filled `var(--foreground)` with `var(--surface)` text, chevrons-up-down 14 px in `var(--text-muted)`. Default unchanged (the parent's child switcher keeps it).

- [ ] **Step 1: Write the failing tests:**
  - `shows the squad and its size on one line`: `SquadSwitcher` with squads U16 (15 players) → trigger text `U16 · 15`; trigger has `data-size="compact"`.
  - `All squads reads as a pill too`: view All → `All squads · 41`.
  - `a long name truncates and keeps its chevron` (Review Focus 5): CSS `.compact .name` has `text-overflow: ellipsis` and `white-space: nowrap`; the chevron column is fixed width.
  - `the parent's switcher is unchanged`: `TeamSwitcher` without `size` has no `data-size`.

- [ ] **Step 2: Run and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** The open list (menu of squads) is unchanged.
- [ ] **Step 4: Run them and `src/components/parent`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: the squad picker as a compact pill (TRAK-<n>)`

### Task 6: Docs and final candidate

**Files:**
- Modify: `docs/design-system/components.md` (new "Frame" section: rail sizes, fold memory and its key, top bar, bell, Create, squad pill; note that the family frame shares the rail)

- [ ] **Step 1: Write the Frame section** from the code as built.
- [ ] **Step 2:** `npx vitest run src` — expected: only the 11 files that fail on unchanged `main` on Windows; `npm run build` exit 0.
- [ ] **Step 3:** Dev server: signed-out check that nothing regressed; signed-in rail, fold memory, top bar and pill are checked on the PR preview (no local Supabase config). Screenshots into the PR.
- [ ] **Step 4:** Push to `fork`, open the PR as **draft** (depends on #776), body ending with the Claude Code line; mark ready once #776 is merged.
