# Components

The shared pieces that apply [Colour and type](colour-and-type.md) and [Spacing and corners](spacing-and-corners.md).
New and changed screens build with these instead of their own classes. Set by TRAK-768.

All import from `@/components/trak/standard` (also re-exported from `@/components/trak`). Every piece uses role tokens
only; `standard-pieces.test.tsx` checks.

## SectionLabel

The small uppercase label above each section of a page.

```tsx
<SectionLabel action={<Button variant="secondary">Edit objectives</Button>}>Season objectives</SectionLabel>
```

`as` (`'h2'` default, or `'h3'`), `id`, `action`. Its class is exported as `SECTION_LABEL` for a label that isn't a
heading.

## StatusPill

A status in words, tone on tint. The words carry the meaning; colour and icon add to it.

```tsx
<StatusPill tone="good">All placed</StatusPill>
<StatusPill tone="needs">1 missing</StatusPill>
<StatusPill tone="neutral" size="sm">Default for 11-a-side</StatusPill>
```

`tone`: `'good' | 'needs' | 'neutral'`. `size`: `'sm'` (12 px) or `'md'` (14 px). `icon`: `'check' | 'dot' | 'none'`;
by default good has a check, needs a dot, neutral nothing.

## NumberBlock

A big figure with its caption on the baseline, and an optional thin progress bar.

```tsx
<NumberBlock value="14 / 15" caption="have 1–2 objectives" progress={14 / 15} tone="needs" />
```

`progress` runs from 0 to 1 and is announced as a progress bar named by the caption. `tone` colours the bar: good
green, needs amber, neutral ink.

## SectionCard

A card: white, `line` edge, 16 px corners, 20/24 px padding. A titled card is a region named by its title.

```tsx
<SectionCard title="Positions" pill={<StatusPill tone="good">All placed</StatusPill>}
  action={<Button variant="ghost">View pitch</Button>} footer={<UnitPills />}>
  <NumberBlock value="15 / 15" caption="players placed" progress={1} tone="good" />
</SectionCard>
```

`title`, `pill`, `action` make the header row; `footer` sits under a `line-soft` hairline; `as` is `'section'` (default),
`'div'` or `'article'`.

## Page header

`PageTop` (`src/components/coach/PageTop.tsx`) is every coach page's header: the title in the standard style, and
optionally `subtitle` and `pill` beside it. Put a `DetailsStrip` in its `below` for a page's facts:

```tsx
<PageTop title="Season plan" subtitle="U16 · 15 players" pill={<StatusPill tone="good">Shared 22 Nov</StatusPill>}
  below={<DetailsStrip items={[{ icon: CalendarDays, label: 'Season', value: '3 Aug 2026 — 30 May 2027' }]}
    callout="Next report: Sun 29 Nov 2026" action={<Button variant="ghost">Edit schedule</Button>} />} />
```

`DetailsStrip`: `items` (`icon`, `label`, `value`), `callout` (shown as a needs pill), `action`.

## Buttons

Arc's `Button` (`@/components/arc/button/button`), with no Trak-only variants:

| Standard | Arc variant | Look |
|---|---|---|
| Main | `primary` | near-black fill, white text |
| Outlined | `secondary` | `line` edge, `ink` text; the edge darkens on hover |
| Plain | `ghost` | no edge, `ink-2` text, `raised` on hover |
| Delete | `danger` | `danger` text |

Every size is at least 44 px tall, with 12 px corners and 14 px semibold text.
