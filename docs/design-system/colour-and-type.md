# Colour and type

One standard for every Trak screen, with [Spacing and corners](spacing-and-corners.md) and
[Components](components.md). Set by TRAK-768 (design: `docs/superpowers/specs/2026-11-24-trak-design-standard-design.md`):
a white canvas, slate greys, near-black main buttons, green for done, amber for "needs you", Inter.

## Colour

Screens take every colour from a role token (`--t-*` in `src/index.css`, Tailwind's `ink`, `line`, `brand`…). Never a
hex code, a Tailwind scale (`slate-500`) or white/black at N%: `hard-coded-colours.test.ts` fails on one.
`design-standard-tokens.test.ts` pins the values and their contrast.

| Tailwind | Token | Role | Value |
|---|---|---|---|
| `ground` | `--t-ground` | the screen | white |
| `surface` | `--t-surface` | cards, sheets | white |
| `raised` | `--t-raised` | chips, quiet buttons, progress tracks | slate-100 |
| `rail` | `--t-rail` | a laptop's side rail | #FAFAFA |
| `ink` | `--t-ink` | headings, body | slate-900 |
| `ink-2` | `--t-ink-2` | supporting lines | slate-600 |
| `ink-3` | `--t-ink-3` | labels, captions, placeholders | slate-500, a touch darker (94 110 133) |
| `line` | `--t-line` | card edges, dividers | slate-300 |
| `line-soft` | `--t-line-soft` | hairlines inside a card | slate-100 |
| `line-strong` | `--t-line-strong` | text boxes, pickers | slate-500 |
| `brand` / `on-brand` | `--t-brand` / `--t-on-brand` | main buttons, selected states / their text | slate-900 / white |
| `success` | `--t-success` | done, good | emerald-700 |
| `pitch` | `--t-pitch` | the pitch's fill and markings | emerald-600 |
| `warning` | `--t-warning` | "needs you" words | amber-800 |
| `attention` | `--t-attention` | "needs you" marks only, never text | #EAB308 (TRAK-275) |
| `info` | `--t-info` | information | blue-700 |
| `danger` | `--t-danger` | errors, delete | red-700 |

Rules:

- **Brand means "do this" or "selected".** A tick, a completed state or a "saved" message is `success`, not `brand`.
  The pitch is `pitch`.
- **A link inside a sentence is underlined** (`underline underline-offset-2`). Near-black `brand` beside grey text is
  only 2.4:1, too little to show it's a link by colour alone.
- **Contrast.** Text is at least 4.5:1 on what it sits on, including `ink-3` on `raised` chips. Input edges and focus
  rings are at least 3:1, which is why text boxes use `line-strong`, not `line`.
- **Status is tone on tint:** text in the tone, background `tone/10`, edge `tone/25`. "Needs you" puts `warning` words
  beside an `attention` dot. Use `StatusPill` rather than writing these classes.
- `.trak-dark` islands (band cards, the player card artwork) and the team-kit designer keep their own colours.
- A coach's laptop shows grey supporting text one step darker (`ink-3` becomes slate-600, TRAK-254).

## Type

**Inter**, served from our own site (`public/fonts/`, Latin, Latin-ext and Greek) because the site's security rules
allow fonts from our origin only. `--t-font` sets it everywhere; headings use it too (`heading-typeface.test.ts`).
Figures that line up (dates, counts, scores, minutes) use `tabular-nums`.

| Role | Style | Where it lives |
|---|---|---|
| Page title | 28 px on a phone, 32 px from a tablet; extra-bold; tracking −0.02em | `PAGE_TITLE` in `src/components/coach/PageTop.tsx` |
| Inner page title (a match, a training) | 28 px, 36 px from 560 px wide; extra-bold | `INNER_TITLE`, same file |
| Page subtitle | 16 px medium `ink-3` | `PageTop`'s `subtitle` |
| Section label | 12 px bold uppercase, tracking 0.12em, `ink-3` | `SectionLabel` |
| Card title | 20 px bold, tracking −0.01em | `SectionCard`'s `title` |
| Body | 15 px, `ink` or `ink-2` | |
| Caption, meta | 14 px medium `ink-3` | |
| Big figure | 36 px extra-bold, tabular | `NumberBlock` |
| Buttons and pills | 14 px semibold; a small pill 12 px | Arc `Button`, `StatusPill` |

These are phone sizes. On a coach's tablet or laptop, fixed text sizes up to 22 px are 2 px larger (TRAK-254,
`src/index.css`); page titles and big figures are not.
