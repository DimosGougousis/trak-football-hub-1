# Coach Home, Squad and Settings on Arc Pro — design

**Owner:** Imad. **Decided:** 22 Oct 2026, after reviewing mockups of every screen below (made-up data, phone 390 px, tablet 820 px, laptop 1440 px). Imad will request further changes after the first build.

## Objective

A coach who opens Trak knows at once what they're looking at and what needs them. The coach's Home and Squad tabs and the app frame around them are rebuilt from Arc Pro components (bought by Imad). Settings moves to Arc's settings page for coaches, parents and players. Parents' and players' other screens don't change.

## Decisions (Imad, 22 Oct)

1. **Frame.** Laptop (≥1024 px wide, the existing `SIDE_MENU_QUERY`): Arc's Sidebar rail as it is. The club's round avatar and name sit at the top; then Home, Calendar, Squads (one row per squad when a coach has two or more), Library (today's Trainings); then Settings, and the coach's avatar, name and role at the bottom. It folds to a 64 px icon rail with `[` or its panel button. The bell, then "+ Create" (Arc glass menu), sit at the top right.
2. **Phone and tablet.** Arc's glass tab bar: Home · Squad · Library, with the "+" merged in at its right as a round glass button that grows into the create menu. The coach's avatar (top left) opens the same sidebar as a sheet. The calendar icon sits top right, left of the bell. **Feedback and Profile leave the coach's nav** (their routes stay).
3. **Colour key** (Tarek's, TRAK-255) on everything a coach scans: the type is a colour (Training teal, Match magenta, Other olive, Tournament blue, unchanged since TRAK-231); the state is a shape (Draft: dashed card, only the coach sees it; Published: solid card with a green Published chip; Cancelled: hollow red ring, struck through, red chip; Started: grey, "Details fixed"). Anything waiting for the coach is amber: take the register after a training, log a match after kick-off; the day gets an amber corner. A draft that clashes with a live event is red. Weather chips wait for TRAK-257's legal check.
4. **Home.** Squad pills (each squad, then All). All is Home's only: it shows every squad on Home and leaves the squad picked for Squad, Schedule and the "+" as it was, so a new event never goes to both squads' families by accident (Imad, 22 Oct). The week is Arc's availability picker as Trak's week: seven days with a dot per event and the amber corner, the chosen day's events as slots, and one next step for the chosen event (Publish, Share with families, Take register, Log it, View log) beside Details, which opens today's event sheet. Then **Squad shape**: a radar of the squad's six-attribute average this month against last month, with the band counts as chips. Then **Needs you**: one swipeable card for every admitted player not assessed for 2+ weeks (or never, once 2 weeks in the squad: TRAK-197's rule) and every unpublished draft. "Assess a player" and "Log a match" leave Home; the "+" covers them. A coach's first open shows Arc's onboarding illustration (four steps), once per device.
5. **Squad.** The **Snapshot tab is removed**. The new **Players** view (Arc's team directory) comes first, then Makis's Attributes, Availability and Games, behind an Arc glass segmented control. Players: position filters with counts, search by name or shirt number, each row with its band and ↑/↓ against the player's own last assessment, and the squad's band bar above the list. Picking a player opens their profile: preferred foot, nationality, born (`26/2/2012 · 14 years old`), traits, the season radar (the player's average per attribute since 1 July against the squad's, out of 10), the coach's assessment card exactly as it is today, and earlier assessments as swipeable cards (Arc scroll area).
6. **Profile fields.** The coach enters preferred foot (left, right, both), nationality (from Trak's existing list) and traits (from the fixed list below; no free text about a player). Date of birth comes from the academy's roster, read by the player's own coach only. Families see none of this yet.
7. **Settings** on Arc's settings page for every role, keeping each role's current rules (a player's name is the roster's; a username login has no email and resets through the guardian; email is shown, not edited):
   - **Coach:** Profile, Club (read-only, set by the academy), Notifications, How Trak works, Account.
   - **Parent:** Profile, Family (linked children, their logins), Consent (approve or withdraw), Notifications, Calendar, How Trak works, Account.
   - **Player:** Profile, Consent (players who consent for themselves, TRAK-177), Notifications (players with their own email), Calendar, How Trak works, Account.
   - **Notifications:** parents and players keep the event reminder email switch (TRAK-136). Coaches get two in-app switches: "Can't make it" alerts in the bell, and "Needs you" on Home. Coach reminder emails are a later issue.
   - "How Trak works" replaces Arc's Billing section for everyone.
8. **Words.** Say "player", never "child", on these screens.
9. **Background.** Every new surface reads Trak's tokens (`--t-ground`, `--t-surface`, `--t-raised`), so Kostas's #FDFBF7 (TRAK-245) applies by changing the tokens alone.
10. **React stays 18.3.** Arc targets React 19; two Arc Pro pieces were adapted (a ref callback's cleanup, `inert`). An upgrade waits until after the pilot's first weeks.

## Traits (fixed list)

From Imad's list, names only. Where his list paired two options with a slash, each option is its own trait; "Knocks ball past opponent" is already in Movement, so the passing pair keeps only "Ball to feet". Picking one of an opposite pair unpicks the other.

- **Movement:** Gets forward whenever possible · Stays back at all times · Comes deep to get the ball · Dribbles down left · Dribbles down right · Dribbles down center · Runs with ball often · Runs with ball occasionally · Hugs touchline · Cuts inside · Gets into opposition area · Arrives late in opposition area · Beats the offside trap · Plays with back to goal · Stays inside penalty area · Moves into channels · Plays one-twos · Tries to knock ball past opponent
- **Passing:** Tries killer balls often · Does not try killer balls · Tries long range passes · Plays short simple passes · Slows down pace · Dwells on ball · Looks for pass rather than finishing · Dictates tempo · Switches ball to wide areas · Ball to feet
- **Finishing and shooting:** Shoots from distance · Refrains from long shots · Lobs the keeper · Rounds the keeper · Shoots with power · Places shots · First time shots · Tries overhead kicks · Tries power free kicks · Tries long range free kicks
- **Defending and tackling:** Dives into tackles · Does not dive into tackles · Marks opponent tightly
- **Technique and general:** Brings ball out of defense · Plays out of trouble · Tries tricks · Curls balls · Uses outside of foot · Likes to beat opponent repeatedly · Adjusts foot before attempting strike · Avoids weaker foot · Uses weaker foot · Long flat throw · Uses long throw to start counter-attacks
- **Opposite pairs:** Gets forward whenever possible / Stays back at all times; Runs with ball often / occasionally; Tries killer balls often / Does not try killer balls; Shoots from distance / Refrains from long shots; Dives into tackles / Does not dive into tackles; Avoids weaker foot / Uses weaker foot.

## Data and privacy

- New table `squad_player_profiles` (one row per `squad_players` row): `preferred_foot`, `nationality`, `traits`, `updated_at`. Only that row's coach reads or writes it (RLS). `traits` is checked against the fixed list and `nationality` against Trak's list, in the database.
- New read `coach_player_birth_dates(p_squad)` (SECURITY DEFINER): date of birth from `roster_children` for the calling coach's own, not departed, players only.
- New columns on `notification_settings` for the coach's two in-app switches (on unless turned off).
- SQL tests under real roles: the coach reads and writes their own players; another coach, the player, a guardian and an anonymous visitor read nothing.

## Delivery (one PR per issue, no stacked PRs)

| Slice | Contents |
|---|---|
| A. Frame | Arc Pro components; sidebar rail (laptop); glass tab bar, "+" glass menu and avatar sheet (phone and tablet); nav changes |
| B. Settings | Arc settings page for coach, parent and player, reusing today's account, consent, family, calendar and reminder code |
| C. Home | Pills, week with the colour key, Squad shape, Needs you, onboarding |
| D. Squad | Players view replacing Snapshot; profile with season radar and swipeable history |
| E. Profile data | `squad_player_profiles`, the birth-date read, the coach's notification switches, SQL tests |

A and E start first. B, C and D start from main once A has merged; D reads E's data.

## Out of scope

Weather (TRAK-257); coach reminder emails; parents' and players' Home, Profile and other screens; Calendar (Schedule) and Library pages themselves (TRAK-255 owns Schedule); a React upgrade.

## Done when

- Phone: the glass tab bar shows Home, Squad, Library and the "+". Every create action still completes. The avatar opens the sidebar sheet. The calendar icon and bell sit top right.
- Laptop: the sidebar matches decision 1 and folds to the rail and back without the page jumping. The bell and "+ Create" sit top right.
- Home and Squad show what decisions 3–5 describe, from real data, with loading, empty and error states.
- Settings works for each role and keeps every rule in decision 7.
- SQL tests prove decision 6's privacy; no role sees anything it can't see today except the coach's new fields.
- Lint, typecheck, unit and SQL tests and the build pass; the PR carries 390 px and 1440 px screenshots.
