# Trak — Status

*Snapshot of where the product stands, and what each person is waiting on.*

## Headline

**The app has no open defects and no unverified features.** Every use case across all four
personas — coach, athlete, parent, club admin — has been exercised against the live database and
works. That was not true a week ago: the previous assessment described features that had since been
removed, and six features had never been run at all.

## Done recently

| Area | What changed |
|---|---|
| **Security** | Full authorization review. Found and fixed a serious flaw: any player could fabricate coach assessments and awards about themselves. Read isolation verified clean for every role, including anonymous |
| **Parent experience** | Parents can now see coach assessments and awards (was silently blocked by a missing policy). Recognition now appears in their alerts feed |
| **Parent invites** | Players can finally *deliver* an invite — a shareable link, via the phone's native share sheet. Previously a parent was only linked if they happened to sign up with the exact invited address |
| **Install experience** | Trak can now be added to a home screen and opens as an app, not a browser tab. Share previews fixed |
| **Signup** | Password rules did not match what the server enforced, so realistic passwords were rejected with a raw error. Fixed across every signup path |
| **Data quality** | The dev seed duplicated every match, assessment and award on each run. Made idempotent; existing duplicates cleaned |
| **Correctness** | Club dashboard showed "1 player" above squads totalling 29. Passport scrolled sideways on narrow phones |

Everything above was verified by running the app, not by reading the code.

## What is blocked, and on whom

| Item | Waiting on |
|---|---|
| **Character feature** — the whole module | Sports psychologist review (in progress) |
| **Company formation, terms, privacy policy, parental consent** | Lawyer meeting |
| **Billing** | Pricing decision — who pays: club, coach or parent |

## Open decisions

- **Age groups.** The data contains a U11s squad, but the app only offers U13 and up. Extend the
  range, or remove that squad?
- **`player_goals` table.** All its code is gone. Drop the table, or leave it?
- **Production domain.** Needed to finish share previews — link previews will not render until
  the image URL is absolute.

## Next up

1. Finish share previews once the domain is confirmed *(small)*
2. Test coverage — 8 test files against 163 source files
3. Backups have never been restore-tested
4. Bundle size — the build warns on chunks over 500 kB

## Reference documents

- **Use Cases and State of the App** — every use case, its status, and the evidence behind it
- **Features That Still Need Work** — the full outstanding list, grouped by readiness
- **Task list** — 14 delegable tasks: QA, content authoring, research, ops prep
