# Spec: coach Home and Squad on a phone, Imad's review (23 Oct 2026)

## Objective

Imad used the live coach app on his phone on 23 Oct and listed 13 fixes for the Home and Squad tabs. The goal is a quieter Home and Squad, the squad pills working as a real filter, and smooth player profiles. The web (laptop) list comes after this one.

## What changes

### Home

| # | Imad's note | Change |
|---|---|---|
| H1 | All first and default | Already live since #432 (deployed 08:58 UTC). The live bundle renders `["All", ...squads]`. No code change; reload the app. |
| H2 | The week doesn't change with the pill | **Data, not the filter.** The filter is right: one squad shows that squad's events plus whole-roster events (squad = null). Every one of the 71 events in prod has squad = null, because 33 of Rehearsal FC's 35 were made before squads shipped (18 Oct). Fix the rehearsal data (see Open questions). No code change. |
| H3 | Remove "Head Coach · Rehearsal FC · U17" | Delete the line, its `coach_details`/`organizations` fetch and its screen memory. |
| H4 | "Dubai time" under the time | Show the academy time only. The clock line appears only when this phone's zone differs that day ("19:00 on this phone"). Same in the event sheet and the event page. |
| H5 | An X on the share sheet | No change. That sheet is the phone's own (iOS/Android), and an app can't add buttons to it. Swipe it down to close. |
| H6 | Sidebar: remove "U15 · U16 · U17 · U18" | Drop the squad list under the club name. The Squads entry stays. |
| H7 | Squad shape | Subtitle is just the squad ("U17"). The band chips (Exceptional, Standout, …) go. The radar's own legend keeps This month / Last month. |

### Squad

| # | Imad's note | Change |
|---|---|---|
| S1 | Remove the band bar and "9 of 9 assessed" | Remove the summary entirely. |
| S2 | Sparklines, not "Good ↑" | Each row ends with Arc's Sparkline (free): the player's overall rating per assessment, oldest to newest, last 6, not interactive. No line under 2 assessments. "Waiting for consent" stays; "Not assessed" goes. The profile header keeps its band chip. |
| S3 | Tapping a player lags, then you scroll yourself | Root cause (reproduced): on a phone the profile sits under the list, and the smooth scroll starts while it's still loading, so it stops short (profile left 505 px down). **Fix: on a phone, a player opens in place of the list, at the top, with "All players" to go back to the same spot.** Tablet and laptop keep the side-by-side layout. |
| S4 | Cards rise from under the screen | Two causes, both reproduced. (1) Every time: the profile pane in the team directory was a Motion layout element (`layout="position"`), so the card was measured against the pane, and the quick look began about a page-scroll below the card (1,423 px for a card at 389 px). The pane is now a plain element. (2) Intermittently, on CI 1 run in 12 and more after a pause: Motion sometimes measures the quick look with a stale page scroll (its cached root scroll), so the grow still began below the screen (701–961 px on an 844 px screen). Fix: the assessment card's quick look opens in place, rising slightly in the middle of the screen, instead of growing out of the card (`Card grow={false}`). Arc's grow stays available to other cards. |
| S5 | Merge Latest and Earlier | One row, "Assessments": the latest first, swipe right for older ones (up to 6, then "All N"). |
| S6 | Date and session name above each card | Remove. The card's quick look already shows both. |

## Boundaries

- Always: one PR from main; existing tests updated where they assert removed text; a browser check at 390 px.
- Ask first: the prod data change for H2; the Slack heads-up for H4 (it changes Kostas's TRAK-223 code in `EventSheet.tsx`, `EventDetails.tsx`).
- Never: change who sees which event (the squad rule stays); touch migrations.

## Commands

- Unit: `npx vitest run`
- Types: `npx tsc --noEmit -p tsconfig.app.json`
- Browser: `npm run build && npx playwright test --config playwright.pilot.config.ts`

## Success criteria

1. Home at 390 px: no role/academy line; Squad shape has no band chips and no "this month against last".
2. An event sheet on a phone in the academy's zone shows no "Dubai time"; with the phone set to another zone it shows "… on this phone".
3. Squad Players: no band bar or "assessed" line; a player with 2+ assessments shows a sparkline at the row's right edge.
4. Tapping a player on a phone shows the profile's top within 300 ms with no scrolling by hand; "All players" returns to the same list position.
5. Opening an assessment card on a scrolled page, 30 runs: every frame of the quick look stays in the top half of the screen (the grow failed this, starting at 701–961 px).
6. One "Assessments" row, latest first, no date line above any card.
7. All unit tests, types and the pilot browser suite pass.

## Open questions

- H2: may I move Rehearsal FC's events onto squads in prod (test academy rows only)?
