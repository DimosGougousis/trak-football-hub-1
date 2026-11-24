# Design standard, step 1: tokens, Inter, shared pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole app the mockup's palette and Inter, and add the shared pieces (section label, status pill, number block, card, page header strip) that later pages are rebuilt with.

**Architecture:** Colours change only through the `--t-*` role tokens in `src/index.css` (Tailwind and Arc already read them), so every screen follows at once. Inter is self-hosted beside Jost. The shared pieces are small token-only React components in `src/components/trak/standard/`; `PageTop` gains the title style and an optional subtitle, pill and details strip. Arc's Button keeps its variants; its CSS is tuned to the standard.

**Tech Stack:** React 18 + TypeScript, Tailwind, Arc components (CSS modules), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-24-trak-design-standard-design.md` (sections 1–4; sections 5–6 are steps 2–3)

## Global Constraints

- Colours come from `--t-*` tokens only; `src/__tests__/hard-coded-colours.test.ts` must stay green. No `slate-*`/`emerald-*`/hex in `src/` outside its allow-list.
- Token values are RGB channels, TRAK-189 format (`--t-ink: 15 23 42;`).
- Corners and spacing per `docs/design-system/spacing-and-corners.md`; no one-off sizes (`rounded-[14px]`, `p-7`).
- Body text 4.5:1 on white; input edges and focus rings 3:1.
- Every tappable thing at least 44 px tall.
- Fonts are served from our origin only (`vercel.json`: `font-src 'self'`). Inter needs Latin, Latin-ext and Greek.
- `.trak-dark` islands and `src/components/trak/kits/*` keep their own colours: do not edit them.
- No behaviour, word or route changes in this step.
- Branch `dimos/design-standard`; one PR titled `TRAK-<n> [design] Design standard step 1: tokens, Inter, shared pieces` (issue number from Dimos). Draft until final; mark ready for the merge gate. **Do not merge before Imad approves the palette.**

## Review Focus

1. **Green that meant "done" turns black.** `brand` is used ~300 times; where it means good/done (ticks, completed bars, "saved"), it now reads near-black. Expected: done/good marks stay green. Task 3 owns the audit and its test.
2. **Arc pieces that borrowed brand for meaning.** Arc maps `--info` and chart `--series-1` to brand, so info badges and the player's radar line would go black. Expected: info is blue, the player's series green. Task 1 pins both.
3. **Greek text falls back to a system font.** Expected: Greek renders in Inter. Task 2 pins the Greek `unicode-range`.
4. **Small buttons under 44 px.** Arc `sm` is 36 px. Expected: 44 px. Task 1 pins `--control-height-sm`.
5. **Players and parents see a half-changed app** (new colours, old type). Expected: acceptable for this step (spec section "Delivery"), but nothing unreadable: the existing contrast of `ink-3` text on `raised` chips must still pass 4.5:1. Task 1's contrast test covers the token pairs.

---

### Task 1: Palette tokens

**Files:**
- Modify: `src/index.css` (`:root` block at ~L150–230, including the legacy HSL variables)
- Modify: `tailwind.config.ts` (colours, ~L57–77)
- Modify: `src/components/arc/arc-theme.css` (Trak bridge ~L91–125; `--control-height-sm` at L74)
- Test: `src/__tests__/design-standard-tokens.test.ts` (new)

**Interfaces:**
- Produces: tokens `--t-rail`, `--t-line-soft`, `--t-pitch` (new) and the new values below; Tailwind colours `rail`, `line-soft`, `pitch`, `attention`.

- [ ] **Step 1: Write the failing test** `design-standard-tokens.test.ts`. Read `src/index.css`, take the first `:root { … }` block, parse `--t-name: r g b;`. Assert exactly:

```ts
const EXPECTED = {
  ground: '255 255 255', surface: '255 255 255', raised: '241 245 249', rail: '250 250 250',
  ink: '15 23 42', 'ink-2': '71 85 105', 'ink-3': '100 116 139',
  line: '203 213 225', 'line-soft': '241 245 249', 'line-strong': '100 116 139',
  brand: '15 23 42', 'on-brand': '255 255 255',
  success: '4 120 87', pitch: '5 150 105', warning: '146 64 14', attention: '245 158 11',
  info: '29 78 216', danger: '185 28 28',
}
```

Also in this file:
- `it('meets contrast')`: a WCAG contrast helper; assert ≥4.5 for `ink`, `ink-2`, `ink-3`, `success`, `warning`, `info`, `danger` on `surface`, and `ink-3` on `raised`; ≥3 for `line-strong` on `surface`; ≥4.5 for `on-brand` on `brand`.
- `it('Tailwind knows the new tokens')`: `tailwind.config.ts` text contains `"rail"`, `"line-soft"`, `"pitch"`, `"attention"` each mapped to `rgb(var(--t-…) / <alpha-value>)`.
- `it('Arc keeps meaning')`: `arc-theme.css` contains `--info: rgb(var(--t-info))`, `--series-1: rgb(var(--t-success))`, and `--control-height-sm: 2.75rem`.

- [ ] **Step 2: Run it and see it fail**
Run: `npx vitest run src/__tests__/design-standard-tokens.test.ts`
Expected: FAIL (old values, missing tokens).

- [ ] **Step 3: Implement.** Set the values in `:root`; add the three new tokens with role comments in the existing style; replace the TRAK-189 note "Values are still today's dark look…" with one line naming this spec. Update the legacy HSL variables to the same colours (`--background`/`--card`/`--popover` white; `--foreground` slate-900; `--primary`/`--accent`/`--ring` slate-900 with white foreground; `--secondary`/`--muted` slate-100; `--muted-foreground` slate-500; `--border` slate-300; `--input` slate-500; `--destructive` red-700). Add the four Tailwind colours. In `arc-theme.css`: `--info: rgb(var(--t-info))` (and drop the TRAK-370 sentence about info keeping green), `--series-1: rgb(var(--t-success))`, `--border-subtle: rgb(var(--t-line-soft))`, `--control-height-sm: 2.75rem`.

- [ ] **Step 4: Run it and see it pass**, then the colour guard:
Run: `npx vitest run src/__tests__/design-standard-tokens.test.ts src/__tests__/hard-coded-colours.test.ts src/lib/__tests__/with-alpha.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** `feat: the design standard's palette in the role tokens (TRAK-<n>)`

### Task 2: Inter, self-hosted

**Files:**
- Add: `public/fonts/inter-normal-variable-latin.woff2`, `…-latin-ext.woff2`, `…-greek.woff2`, `public/fonts/Inter-OFL.txt`
- Modify: `src/index.css` (header comment, `@font-face` blocks, `--t-font`, `--t-font-mono`)
- Test: `src/__tests__/inter-typeface.test.ts` (new); `src/__tests__/heading-typeface.test.ts` stays as is

**Interfaces:**
- Produces: `--t-font: 'Inter', system-ui, sans-serif` (and `--t-font-mono` the same); `.tabular` is Tailwind's `tabular-nums`, nothing new.

- [ ] **Step 1: Write the failing test** `inter-typeface.test.ts`:
  - the three woff2 files and `Inter-OFL.txt` exist under `public/fonts/`;
  - `index.css` has three `@font-face` rules with `font-family: 'Inter'`, `font-weight: 100 900`, `font-display: swap`, each `src: url('/fonts/inter-normal-variable-<subset>.woff2')`;
  - the Greek rule's `unicode-range` includes `U+0370-03FF`;
  - `--t-font` and `--t-font-mono` start with `'Inter'`;
  - no `fonts.googleapis.com` or `fonts.gstatic.com` anywhere in `index.html`, `src/index.css` or `vercel.json`.

- [ ] **Step 2: Run it and see it fail**
Run: `npx vitest run src/__tests__/inter-typeface.test.ts`
Expected: FAIL (no files).

- [ ] **Step 3: Get the files.** Source: the `@fontsource-variable/inter` npm package (OFL), files `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2`, `inter-greek-wght-normal.woff2`, copied and renamed; licence from the package. Use `npm pack @fontsource-variable/inter` into the scratchpad, not a dependency. **This is a download: ask Dimos first** (name, source, size). Unicode ranges: copy from the package's `index.css` for those three subsets.

- [ ] **Step 4: Implement.** Add the three `@font-face` rules; set both font tokens; rewrite the top-of-file comment to say Inter is served from our origin, Greek included. Leave the Jost and DM faces (other code may name them); removing them is step 4 work.

- [ ] **Step 5: Run it and see it pass**
Run: `npx vitest run src/__tests__/inter-typeface.test.ts src/__tests__/heading-typeface.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit** `feat: Inter, served from our own site with Greek (TRAK-<n>)`

### Task 3: Green that means "done" stays green

**Files:**
- Modify: the files found in Step 1 (expected: `FormationBoard.tsx` `BoardFace` done mark and `Markings`/`BoardPitch` fill; tick marks and completed progress bars across `src/components` and `src/pages`)
- Test: `src/__tests__/brand-means-action.test.ts` (new)

**Interfaces:**
- Consumes: `success`, `pitch` Tailwind colours (Task 1).

- [ ] **Step 1: List them.** `git grep -n -E "(bg|text|border|fill|stroke)-brand" -- src ':!**/__tests__/**'` and keep each hit where brand marks *done / good / complete / on the pitch* rather than *the main action or the current selection*. Write the list (file:line, old → new) into the PR description.

- [ ] **Step 2: Write the failing test** `brand-means-action.test.ts`: for each file in a `DONE_MARKS` table (from Step 1: file + a substring that identifies the line, e.g. `['components/coach/squad/formations/FormationBoard.tsx', 'data-mark="done"']`), assert the line uses `bg-success`/`text-success` and not `brand`; and `BoardPitch`/`Markings` use `text-pitch`/`bg-pitch/` and not `brand`.

- [ ] **Step 3: Run it and see it fail**
Run: `npx vitest run src/__tests__/brand-means-action.test.ts`
Expected: FAIL.

- [ ] **Step 4: Swap** each listed `brand` to `success` (marks, bars) or `pitch` (pitch fill and lines). Selected states, main buttons and focus outlines stay `brand`.

- [ ] **Step 5: Run it and the full unit suite**
Run: `npx vitest run src`
Expected: PASS, apart from tests that pin an old class or colour; update each such assertion to the new token in this commit and name them in the PR.

- [ ] **Step 6: Commit** `fix: done marks and the pitch stay green under the new palette (TRAK-<n>)`

### Task 4: Shared pieces

**Files:**
- Create: `src/components/trak/standard/SectionLabel.tsx`, `StatusPill.tsx`, `NumberBlock.tsx`, `SectionCard.tsx`, `index.ts`
- Modify: `src/components/trak/index.ts` (re-export `./standard`)
- Test: `src/components/trak/standard/__tests__/standard-pieces.test.tsx`

**Interfaces:**
- Produces:
  - `SectionLabel({ as = 'h2', id?, action?: ReactNode, children }): JSX.Element`. Class constant `SECTION_LABEL = 'text-xs font-bold uppercase tracking-[0.12em] text-ink-3'` exported.
  - `type Tone = 'good' | 'needs' | 'neutral'`; `StatusPill({ tone, size = 'md', icon?: 'check' | 'dot' | 'none', children })`. good: `text-success bg-success/10 border-success/25`; needs: `text-warning bg-attention/10 border-attention/25`, dot `bg-attention`; neutral: `text-ink-2 bg-raised border-line`. `rounded-full`, 12 px (sm) / 14 px (md) semibold. Default icon: good → check, needs → dot, neutral → none.
  - `NumberBlock({ value: ReactNode, caption: string, progress?: number /*0..1*/, tone?: Tone })`: figure `text-4xl font-extrabold tracking-tight tabular-nums text-ink`, caption `text-[15px] font-medium text-ink-3` on the baseline; bar `h-1.5 rounded-full bg-raised` with a fill `bg-success` (good), `bg-attention` (needs), `bg-ink` (neutral), `role="progressbar"` with `aria-valuenow` as a whole percent.
  - `SectionCard({ title?: ReactNode, pill?: ReactNode, action?: ReactNode, footer?: ReactNode, as = 'section', children })`: `rounded-2xl border border-line bg-surface p-5 laptop:p-6 grid gap-6`; title `text-xl font-bold tracking-[-0.01em] text-ink` as `h3`; footer above a `border-t border-line-soft pt-5`.

- [ ] **Step 1: Write the failing tests:**
  - `SectionLabel renders an h2 with the label style and its action`
  - `StatusPill good shows a check and success colours`; `needs shows a dot`; `neutral shows no icon`
  - `NumberBlock exposes progress as a progressbar at 93 for 14/15` (`progress={14/15}` → `aria-valuenow="93"`); `omits the bar without progress`
  - `SectionCard renders its title as h3, pill, action and footer in order`
  - `no piece uses a colour outside the tokens` (render each, assert no class matches `/(slate|emerald|amber|gray)-\d/`)

- [ ] **Step 2: Run them and see them fail**
Run: `npx vitest run src/components/trak/standard`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** the four components to the interfaces above (Lucide `Check` for the check icon).

- [ ] **Step 4: Run them and see them pass**
Run: `npx vitest run src/components/trak/standard src/__tests__/hard-coded-colours.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** `feat: the standard's shared pieces (TRAK-<n>)`

### Task 5: Page header

**Files:**
- Modify: `src/components/coach/PageTop.tsx` (`PAGE_TITLE`, `INNER_TITLE`, `PageTop` props)
- Create: `src/components/trak/standard/DetailsStrip.tsx` (export from `standard/index.ts`)
- Test: `src/components/coach/__tests__/page-top-standard.test.tsx` (new); update any test pinning the old `PAGE_TITLE` string

**Interfaces:**
- Consumes: `StatusPill` (Task 4).
- Produces:
  - `PAGE_TITLE = 'flex min-h-10 min-w-0 items-center text-[28px] tablet:text-[32px] font-extrabold leading-none tracking-[-0.02em] text-ink'`; `INNER_TITLE` keeps its sizes with `font-extrabold` in place of `font-medium`.
  - `PageTop` new optional props: `subtitle?: ReactNode` (16 px medium `text-ink-3 tabular-nums`, beside the title), `pill?: ReactNode` (beside the subtitle). Existing props and layout unchanged.
  - `DetailsStrip({ items: { icon: LucideIcon; label: string; value: ReactNode }[]; callout?: ReactNode; action?: ReactNode })`: `border-y border-line py-4`, items in a wrapping row `gap-x-8 gap-y-3 text-[15px]`, icon `size-4 text-ink-3`, label `font-medium text-ink-3`, value `font-semibold text-ink tabular-nums`; `callout` renders as a needs-tone `StatusPill`; `action` sits at the end. Passed to `PageTop` through its existing `below` prop.

- [ ] **Step 1: Write the failing tests:**
  - `PageTop shows the title as h1 in the standard style` (class contains `font-extrabold` and `text-[28px]`)
  - `PageTop shows subtitle and pill beside the title`
  - `DetailsStrip lists each item's label and value, the callout and the action`

- [ ] **Step 2: Run them and see them fail**
Run: `npx vitest run src/components/coach/__tests__/page-top-standard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** to the interfaces; update the TRAK-422 comment to name the new sizes and this spec.

- [ ] **Step 4: Run it and the suite**
Run: `npx vitest run src`
Expected: PASS after updating assertions that pinned the old title class (list them in the PR).

- [ ] **Step 5: Commit** `feat: the standard page title, subtitle and details strip (TRAK-<n>)`

### Task 6: Arc buttons to the standard

**Files:**
- Modify: `src/components/arc/button/button.module.css`
- Test: `src/components/arc/__tests__/button-standard.test.ts` (new)

- [ ] **Step 1: Write the failing test** reading the CSS module text: `.button` has `font-weight: 600`; `.secondary:hover:not(:disabled)` sets `border-color: var(--border-strong)`; `.ghost:hover:not(:disabled)` keeps `background: var(--surface-muted)`.

- [ ] **Step 2: Run it and see it fail**
Run: `npx vitest run src/components/arc/__tests__/button-standard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**: `font-weight: 600` on `.button`; add the outlined hover edge. Main stays `--accent` (now near-black via Task 1); no new variants.

- [ ] **Step 4: Run it and see it pass**, same command. Expected: PASS.

- [ ] **Step 5: Commit** `feat: Arc buttons in the standard's weight and hover (TRAK-<n>)`

### Task 7: The written standard

**Files:**
- Create: `docs/design-system/colour-and-type.md` (spec sections 1–2: token table with roles, pill tones, contrast rules, type table, Inter and Greek)
- Create: `docs/design-system/components.md` (spec section 4, with each piece's import path and props from Tasks 4–5, and the button mapping)
- Modify: `docs/design-system/spacing-and-corners.md` (link both new pages at the top; page sections row becomes "40 px; 48 px on a laptop (`gap-10 laptop:gap-12`)"; remove "Text sizes are not part of this rule")

- [ ] **Step 1: Write the three docs** from the spec and the code as built; examples use token classes only.
- [ ] **Step 2: Check links** — every relative link in the three files resolves to an existing file (`ls` each path).
- [ ] **Step 3: DOX closeout** — re-read root `AGENTS.md`; add one line under "Data and UI conventions" pointing to `docs/design-system/` as the standard new and changed screens follow (it is a new contract), and nothing else.
- [ ] **Step 4: Commit** `docs: the design standard's colour, type and components (TRAK-<n>)`

### Task 8: Final candidate

- [ ] **Step 1:** Run `npx vitest run src` and `npm run build`. Expected: both exit 0.
- [ ] **Step 2:** Start the dev server (`.claude/launch.json`), sign in with the local dev coach (password from `VITE_DEV_PASSWORD`), and screenshot Home, Squad › Formations and one player page at phone and laptop widths, plus one Greek screen. Attach to the PR.
- [ ] **Step 3:** Push the branch, open the PR (draft → ready), body: what changed, the Task 3 swap list, updated tests, screenshots, "Do not merge before Imad approves the palette", ending with the Claude Code line.
