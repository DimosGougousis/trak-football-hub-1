# Spec: event times on the phone's own clock (TRAK-274, 23 Oct 2026)

## Objective

Imad, 23 Oct: "the time on Trak should sync with every phone. If I am in Greece and the event is at 19:00, and I travel to Dubai, I want the event to then show 20:00." Today (TRAK-223) every screen shows the academy's clock and names it ("Dubai time"), with the phone's time as a note.

## Decisions

- **Screens people read show the phone's clock:** coach Home's week and event sheet, Schedule's month and day list (and its meet time), Availability, the family and player week, event page, upcoming cards and the parent bell. Day and time come from `starts_at` in the phone's zone; an event with no time yet keeps the academy's day. The meet time moves by the same gap as the start.
- **Zone line:** none when the phone is in the academy's zone. Otherwise a second line with the academy's own time: "20:00 Dubai time" ("Wed 01:00 Athens time" on another day).
- **Stays on the academy's clock (Imad, 4b):** Schedule's edit form and saves, the WhatsApp share text, fixture import, emails, reminders, the calendar feed. No database change.
- **Guard:** a time only moves by an academy's own gap (Dubai +4, Athens +2/+3, the zones the database allows); anything else is shown as typed, with no zone line.
- **Not done:** the new-event form can't name the academy's zone for a coach elsewhere; the app doesn't know it before an event is saved.

## Where

- `src/lib/event-time.ts`: `phoneEventTime`, `phoneClock`; `academyClock` returns the academy line or null.
- `src/lib/player-events.ts`: `toPlayerEvent` reads the phone's clock and keeps `academy`; `meetText`, `academyLine`; "what changed" compares against the old copy on today's clock.
- `src/lib/coach-week.ts`, `CoachWeekStrip.tsx` (loads a day either side), `CoachSchedule.tsx` (display lines only), `AvailabilityTab.tsx`, `EventSheet.tsx`, `EventDetails.tsx`.

## Success criteria

1. A 20:00 Dubai event reads 20:00 with no zone line on a Dubai phone, and its Athens time plus "20:00 Dubai time" on an Athens phone (browser test).
2. 23:00 Athens on a Dubai phone moves to the next day; a meet time moves with the start, across midnight too (unit tests).
3. The edit form, share text and saves are unchanged (existing Schedule tests).
4. The unit suite passes with the clock on UTC, Dubai and Athens.
