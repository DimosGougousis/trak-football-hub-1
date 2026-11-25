# Spacing and corners

One standard for every Trak screen: coach, player, parent and the signed-out pages.
Set by TRAK-464 (PR #642, 15 Nov 2026), part of the design system (TRAK-241).
New and changed screens follow it. Colours and text sizes are in [Colour and type](colour-and-type.md);
the shared pieces that apply all three are in [Components](components.md).

## Corners

Four sizes. Round things (avatars, pills, dots) stay round.

| Size | Used for | Tailwind | CSS token |
|---|---|---|---|
| 16 px | Cards, sheets, panels, menus | `rounded-2xl` (`rounded-3xl` is also 16 px) | `--radius-panel`, `--radius-surface` |
| 12 px | Boxes, inputs and buttons inside a card; list rows | `rounded-xl`, `rounded-lg`, `rounded-md` | `--radius-control`, `--radius` |
| 8 px | Small labels and chips | `rounded-sm` | |
| 4 px | Tiny things: checkboxes, small marks | `rounded` | |

- Thin bars and chart keys (2 px tall or wide) may use 2 px.
- No one-off sizes such as `rounded-[14px]`. Use the nearest size above.
- A button joined to another (split button) keeps the outer corners at 12 px and squares the inner ones.

## Spacing

| Where | Space |
|---|---|
| Inside a card | 20 px; 24 px on a laptop (`p-5 laptop:p-6`) |
| Inside a box within a card | at least 12 px (`p-3`) |
| Between two lines of text in a row | at least 4 px (`gap-1`) |
| A title and the line under it | 8 px (`gap-2` or `mt-2`) |
| Cards in a list | 16 px (`gap-4` or `space-y-4`) |
| A page's sections | 40 px; 48 px on a laptop (`gap-10 laptop:gap-12`), the design standard (TRAK-768) |
| Page sides | `WIDE_COLUMN` in `src/components/trak/MobileShell.tsx` (20 px phone, 32 px tablet and up) |

Arc components use the `--space-*` tokens in `src/components/arc/arc-theme.css` (`--space-1` is 4 px, `--space-2` 8 px, and so on).

## Not covered

- The team-kit designer (`src/components/trak/kits/*.css`) keeps its own dark design.
- The segmented buttons' inner highlight follows its outer corner.

## Where the sizes live

- `src/components/arc/arc-theme.css`: `--radius-*` and `--space-*`.
- `src/index.css`: `--radius` (12 px).
- `tailwind.config.ts`: `rounded-md` and `rounded-3xl` overrides.
