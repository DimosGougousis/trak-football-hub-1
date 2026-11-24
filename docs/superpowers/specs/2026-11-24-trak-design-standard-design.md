# Trak design standard: colours, type, shared pieces and the coach frame

Date: 24 Nov 2026 · Owner: Dimos (PM) · Status: approved in conversation, awaiting Imad's sign-off on the palette

## Why

Trak's screens were built page by page and now differ in title sizes, label styles, button looks and card layouts.
The goal is one standard with uniform rules, colours and layout, so every screen looks like it belongs to the same app
and new screens are consistent by construction. The reference is Dimos's "Season plan (U16)" HTML mockup (24 Nov):
white canvas, slate greys, near-black main buttons, green/amber status pills, uppercase section labels, large figures,
airy cards, 44 px tap targets, Inter.

The Squad page (`/coach/squad`, starting with `?tab=formations`) is the first page moved onto the standard.

## Goals

- One written standard in `docs/design-system/`, extending TRAK-464's spacing and corners with colour, type and the
  shared pieces below.
- The mockup's palette and font across the whole app, applied through the existing theme tokens.
- A small set of shared pieces every page uses instead of its own classes.
- The coach frame reshaped to the mockup's rail and top bar on a laptop.
- The Squad page (Players and Formations) rebuilt on the shared pieces.

## Non-goals

- New features. The bell, "+ Create", the trail and the squad picker already exist in `CoachFrame`; they are restyled,
  not rebuilt. The mockup's season-plan content (objectives, readiness cards, its modals) is not part of this work.
- The player and parent frames (`FamilyFrame`). Their colours change with the tokens; their layout moves later, page
  by page.
- Dark islands (`.trak-dark`: band cards, the player card artwork) and the team-kit designer keep their own look.
- Text in the mockup (names, "Alex Ferguson") is sample content and is not copied.

## Anti-goals (a failure even if it works)

- Hard-coded colours. `src/__tests__/hard-coded-colours.test.ts` stays and passes; the mockup's `slate-*`/`emerald-*`
  classes are translated to tokens, never pasted.
- One-off sizes that bypass the standard (`rounded-[14px]`, `p-7`).
- Losing text contrast: body text 4.5:1, input edges and focus rings 3:1 on white.
- Changing where things are on a phone. Coaches keep the bottom tab bar and the avatar menu.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Write the standard and build the shared pieces first, then move pages over one PR at a time, Squad first | Slower to a visible result; consistent by construction |
| B | Retune the theme tokens only | Fast app-wide colour change, but layout and type stay inconsistent |
| C | Restyle Squad directly, extract pieces later | Fastest visible result; pages drift, the opposite of the goal |

Dimos picked A. Within A he picked the **full look** (mockup palette and Inter, not keeping Futura/Jost) and **the
mockup's frame** (reshape the coach frame, not just restyle inside it).

## 1. Colours

Values go in `src/index.css` `:root` as RGB channels (TRAK-189 format). Arc already reads them through
`arc-theme.css`. The legacy shadcn HSL variables in the same block (`--background`, `--primary`, `--border`, …) are
updated to match so older components follow.

| Token | Role | New value | Mockup source |
|---|---|---|---|
| `--t-ground` | the screen | 255 255 255 | white |
| `--t-surface` | cards, sheets | 255 255 255 | white |
| `--t-raised` | chips, quiet buttons, tracks | 241 245 249 | slate-100 |
| `--t-rail` (new) | the laptop rail | 250 250 250 | `#FAFAFA` |
| `--t-ink` | headings, body | 15 23 42 | slate-900 |
| `--t-ink-2` | supporting lines | 71 85 105 | slate-600 |
| `--t-ink-3` | labels, captions | 94 110 133 | slate-500, a touch darker so labels on `raised` chips pass 4.5:1 |
| `--t-line` | card edges, dividers | 203 213 225 | slate-300 |
| `--t-line-soft` (new) | hairlines inside a card | 241 245 249 | slate-100 |
| `--t-line-strong` | text boxes, pickers | 100 116 139 | slate-500 (see note) |
| `--t-brand` | main buttons, selected states | 15 23 42 | slate-900 |
| `--t-on-brand` | text on brand | 255 255 255 | white |
| `--t-success` | done / good | 4 120 87 | emerald-700 |
| `--t-pitch` (new) | pitch fill and markings | 5 150 105 | emerald-600 |
| `--t-warning` | "needs you" words | 146 64 14 | amber-800 |
| `--t-attention` | "needs you" marks only | 245 158 11 | amber-500 |
| `--t-info` | information | 29 78 216 | blue-700 |
| `--t-danger` | errors, delete | 185 28 28 | red-700 |
| `--t-orange` | out-of-position ring | unchanged | |

Calls made here (Claude's, accepted in the playback):

- The mockup draws input edges in slate-300, which is 1.5:1 on white and fails the 3:1 rule, so `--t-line-strong`
  is slate-500. Card edges keep the mockup's slate-300 (`--t-line`).
- Green as text uses emerald-700, not the mockup's emerald-600 (3.8:1), to pass 4.5:1.
- The pitch used `text-brand`; with brand turning near-black, `FormationBoard`'s `Markings` and the pitch fill move
  to the new `--t-pitch`, otherwise the pitch turns black.

**Status pills** are always tone-on-tint: text in the tone, background `tone/10`, edge `tone/25`, an optional 6 px dot or
check in the tone. Three tones: good (`success`), needs you (`warning` text, `attention` dot), neutral (`ink-2` on
`raised`).

## 2. Type

**Font:** Inter, variable, self-hosted in `public/fonts/` with its OFL licence beside it, like Jost today.
`vercel.json` allows `font-src 'self'` only, so Google Fonts is not an option. The Latin, Latin-ext **and Greek**
subsets are needed (the app ships in Greek, TRAK-408/409). `--t-font` and `--t-font-mono` become Inter; Arc's
`--font-body` already expects "Inter Variable". Figures that line up (dates, counts, scores) use `tabular-nums`.

| Role | Size / weight | Notes |
|---|---|---|
| Page title | 28 px phone, 32 px tablet and up; extra-bold (800); tracking −0.02em; leading none | Replaces `PAGE_TITLE` in `PageTop.tsx` (TRAK-422). The 28 px phone size is Claude's call: 32 px crowds a 375 px screen beside the avatar |
| Inner page title | unchanged size, weight 800 | `INNER_TITLE` keeps its sizes, takes the new weight |
| Section label | 12 px, bold (700), uppercase, tracking 0.12em, `ink-3` | Above each section of a page |
| Card title | 20 px, bold (700), tracking −0.01em | |
| Body | 15 px, regular, `ink` or `ink-2` | |
| Caption / meta | 14 px, medium, `ink-3` | Page subtitle (e.g. "U16 · 15 players") is 16 px medium `ink-3` |
| Big figure | 36 px, extra-bold, tabular | In the number block |
| Button and pill text | 14 px semibold; small pill 12 px semibold | |

## 3. Corners and spacing

Unchanged from `docs/design-system/spacing-and-corners.md` (TRAK-464). Where the mockup differs, the standard wins
(Claude's call): its 14 px card corners become 16 px (`rounded-2xl`), its 28 px card padding becomes 20/24 px
(`p-5 laptop:p-6`), its 12 px button corners are already the standard's. Every tappable thing is at least 44 px tall.

## 4. Shared pieces

New, in `src/components/trak/standard/` (folder name is the builder's call), all on tokens, Arc used underneath where
an Arc component already does the job (Button, Badge, Progress, Card):

- **SectionLabel**: the section label style, as an `h2` by default, with an optional action on the right
  (e.g. "Edit objectives" as an outlined button).
- **StatusPill**: `tone: 'good' | 'needs' | 'neutral'`, optional icon or dot, `size: 'sm' | 'md'`.
- **NumberBlock**: big figure, caption beside it on the baseline, optional 6 px progress bar whose colour follows a
  tone.
- **Card**: `surface`, `line` edge, 16 px corners, standard padding; optional header row (card title, pill, action) and
  footer strip with a `line-soft` divider.
- **PageHeader** extension: `PageTop` gains an optional subtitle and status pill beside the title, and an optional
  details strip under it: hairlines above and below, items as icon + label + value, an amber "next" callout pill, a
  plain action at the end.
- **Buttons** (Arc `Button` variants mapped to the standard, not a new component): main = `brand` fill, `on-brand`
  text; outlined = `line` edge, `ink` text, edge darkens on hover; plain = no edge, `ink-2` text, `raised` on hover.
  All 44 px min height, 12 px corners, 14 px semibold.

The standard doc gets one page per piece group: `colour-and-type.md` (sections 1–2 above) and `components.md`
(this section), both linked from `spacing-and-corners.md`.

## 5. The coach frame (laptop)

Restyle and reshape `CoachFrame` and the Arc `sidebar-rail` block it uses:

- **Rail:** 192 px wide, `--t-rail` background, `line` edge on the right. Club mark and name at the top, the squad
  picker as a bordered pill under it (squad badge, "U16 · 15", up/down chevron), then the nav rows (44 px, 12 px
  corners, 18 px icons; the current row on an `ink/8` fill, the mockup's slate-200 at 75%, with `ink` text and semibold; other rows `ink-2`,
  `ink/5` on hover), then Settings and the coach's avatar,
  name and role at the bottom above a hairline.
- **Collapse:** a panel button in the top bar collapses the rail to 68 px, icons only, with each row's name as its
  tooltip. The choice is remembered on the device (Claude's call).
- **Top bar:** 64 px, sticky, white at 95% with a blur and a `line-soft` hairline under it. Left: the collapse button and
  the trail ("Home / Season plan"). Right: the bell (outlined 44 px square, amber dot when there is something) and
  "+ Create" (main button).
- **Page body:** white canvas, content up to the existing `WIDE_COLUMN` width, sections 40 px apart on a phone,
  48 px on a laptop (the mockup's `gap-10 lg:gap-12`). This widens TRAK-464's 24/32 px for page sections; Claude's
  call, as part of the "full look", recorded in the standard as the new page-section gap.

**Phone and tablet:** keep today's behaviour: the glass bottom tab bar with "+", and the avatar opening the same rail
as a sheet. The sheet takes the new rail styling (Claude's call).

## 6. The Squad page (first page moved)

`src/pages/coach/CoachSquadPage.tsx`, `src/components/coach/squad/PlayersTab.tsx` and
`src/components/coach/squad/formations/*`:

- Page header: "Squad" in the new title style, the Players / Formations switch beside it as today.
- **Formations:** "Saved formations" as a SectionLabel with "+ New" (outlined) on the right; each saved formation a
  card-styled button (selected one with a `brand` edge and check). The editor is a Card: card title (formation name)
  with the rename pencil, a StatusPill for state ("All saved" good / "Unsaved changes" needs you), Discard (plain) and
  Save (main). Use for matches and Make default as outlined buttons, the default as a neutral pill. The pitch uses
  `--t-pitch`. "Set for matchday" and Delete sit in the card footer strip. The locked state ("Place N players to
  open") becomes a Card with a NumberBlock ("12 / 15 placed" with its bar) and the Positions button.
- **Players:** list and player page on Cards, SectionLabels for groups, status pills for consent and wait states.
  The builder maps each existing element to a shared piece; behaviour, words and routes do not change.

## Delivery

Each step is its own TRAK issue and PR, in this order:

1. Standard docs, tokens, Inter, shared pieces (this changes colours app-wide, players and parents included).
2. Coach frame.
3. Squad page.
4. Every other page, one PR each, ordered by coach traffic.

## Open

- **Imad's sign-off on the palette.** The `index.css` note says the light palette replaces today's values once Imad
  approves it. PR 1 needs his OK before merge.
- **TRAK issue numbers** for steps 1–3 (Dimos to create or assign).

## Left to the builder

Folder and component names; how Arc's `sidebar-rail` is extended for the collapse; which existing tests that pin
`PAGE_TITLE`, colours or class names need updating; the exact Inter build and subsetting.
