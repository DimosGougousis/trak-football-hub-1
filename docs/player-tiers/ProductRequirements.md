---
name: player-tiers
status: approved
owner: Dimos Gougousis
follows: none
---

# Product Requirements: Player Tiers

Source: `/product-requirements` interview, 2026-11-18. Input: the tier spec from YUUP run `yuup-2026-11-18-player-tiers` (`pipeline/active/yuup-2026-11-18-player-tiers/player-tiers-spec.md`), built from the *Monetizing Athletic Progression* deck.

## Interview Summary

### Demand Reality

Parents of youth football academy players. The segment has been validated with academy parents. Today they piece together their child's progress from WhatsApp groups, side conversations with the coach and spreadsheets. There is no single record.

### Status Quo

All three groups pay a cost today:

- **Coaches** spend 6+ hours a week on admin: logging tests, tracking attendance and updating parents.
- **Parents** get no structured feedback, so they can't see whether the academy fee is paying off.
- **Players** have no record of their training, stats or coach feedback. Unstructured time goes to the PlayStation instead of football homework and personal development.

### Narrowest Wedge

Launch Basic ($9/mo) and Premium ($29.99/mo) together at the partner academy, without Standard. Both tiers rest on the coach loop:

- a verified coach who onboards players directly (the parent is notified and can revoke)
- coach-signed tests that move the Player Card
- Skill Tree drills
- coach feedback with the parent copied
- a parent progress feed

Premium adds a training video library embedded from YouTube, with the academy's curated multiple-choice tests, and wearable sync. It sells tools, never progression.

### Falsifiable Hypothesis

If we ship Basic and Premium on top of the coach loop, the share of rostered players who log at least 2 drills a week moves from 0% to 60% within 60 days of launch.

### Anti-Requirements

- **No Standard tier in v1.** The $25 decoy waits until there are real Basic and Premium price data to anchor against.
- **No paid ads and no ad network.** Basic launches ad-free. The academy is in Greece and the players are 15. Under GDPR, no ad profiling of minors is planned, and ads stay out of v1.
- **No streak discounts and no physical perks.** No dynamic pricing (deck S9). No tickets, camps or merchandise (deck S10).
- **Kept in scope:** academy bundle billing (deck S10) was not ruled out, but no requirement below depends on it.

## Success Metric

- **Metric:** Share of rostered players who log at least 2 drills in a calendar week (weekly active players)
- **Current value:** 0% (no app in use today)
- **Target:** 60% of the partner academy roster
- **Time window:** 60 days after launch (launch 2027-06-01)
- **Data source:** App drill-log events joined to the academy roster, weekly
- **Metrics anchor:** analytics/metrics.md#weekly-active-players

## Kill Criteria

- **Condition:** Weekly active players stay below half the target at day 60
- **Threshold:** Fewer than 30% of rostered players log 2 or more drills a week
- **Decision date:** 2027-07-31

## Requirements

### REQ-001: Verified coach onboards players directly

- **Description:** An academy invites a coach. While the coach's verification is active (in Greece, a criminal record certificate checked by the academy), the coach can onboard a player directly. Onboarding needs no parent approval step, but it does need:
  - the parent's email
  - the academy's reference for the parental consent it collected at academy registration

  The link is active immediately. The parent is notified and invited to the parent account, and can revoke the link at any time. Spec refs: CP-01 (amended), GR-07.
- **Falsifiable Hypothesis:** Removing the parent approval step gets every rostered player active on day 1, without waiting on parents. Coach verification, academy-attested consent and parent revoke keep the link safe.
- **Test-for-Truth:** In the test environment, create one coach whose verification has expired and one whose verification is active. Then try onboarding a player and a parent revoke.
- **Acceptance:** GIVEN a verified coach WHEN they onboard a player with a parent email and an academy consent reference THEN the link is active immediately and the parent receives exactly 1 notification; GIVEN a coach whose verification has expired WHEN they onboard a player THEN the request is rejected and 0 roster links are created; GIVEN an active link WHEN the parent revokes THEN the coach loses access within one request.
- **Amended:** 2026-11-18, at the owner's request. The parent approval step was removed from onboarding.

### REQ-002: Coach-signed tests drive the Player Card on every tier

- **Description:** Only a coach-signed test result changes Player Card attributes (Pace, Dribbling, Tactical Awareness). Self-logged drills earn XP and Skill Tree progress only. Premium wearable and video data feed trends but never write attributes. Spec refs: CP-02, CP-03, GR-01, GR-11.
- **Falsifiable Hypothesis:** If attributes move only on coach-signed tests, Premium cannot buy progression (deck S8), and parents can trust the card.
- **Test-for-Truth:** Make a self-logged drill entry and a wearable sync on a Premium account, then make a coach-signed test on a Basic account.
- **Acceptance:** GIVEN a Premium player WHEN a drill is self-logged and a wearable sync completes THEN 0 attribute values change; GIVEN a Basic player WHEN a coach signs a test THEN the attributes update and the parent feed shows the change within 1 minute.

### REQ-003: Player training record with coach feedback, parent copied

- **Description:** Every player has one record: drills logged, test results, XP and coach feedback. The coach can never message a player privately. Every coach message and every reply copies the parent. The parent gets a weekly progress feed. Spec refs: CP-03, CP-05, CP-12, GR-08, GR-09.
- **Falsifiable Hypothesis:** A visible record plus coach feedback moves weekly active players to 60%. It also cuts coach admin from 6+ hours a week, because the parent updates go out automatically.
- **Test-for-Truth:** Send a coach message with no parent recipient. Then check the weekly feed and the drill-log events for a test roster.
- **Acceptance:** GIVEN a coach WHEN they send a message to a player with no parent copied THEN the API rejects it; GIVEN a player who logged drills this week WHEN the weekly feed runs THEN the parent receives drills, XP and coach notes for that week.

### REQ-004: Premium tools as a parent-paid entitlement

- **Description:** Premium at $29.99/mo unlocks two things:

  - a library of training videos that the academy adds from YouTube. Videos are embedded with YouTube's player, never downloaded. Each video carries the academy's own multiple-choice test, curated alongside the video links (OQ-9).
  - wearable sync from **Whoop or Fitbit**, the first two vendor adapters. Heart rate, sleep and recovery count as health data under GDPR Art. 9, so each data type needs explicit opt-in by the parent.

  No footage of players is uploaded or stored. Basic at $9/mo has the full coach loop with no ads. Spec refs: CP-07, CP-08, GR-12, decision D1.
- **Falsifiable Hypothesis:** Parents who see coach-signed progress on Basic will pay for acceleration tools on Premium. The paid share is tracked alongside the success metric.
- **Test-for-Truth:** Check entitlements on a Basic account and a Premium account. Try a wearable ingest with no parent opt-in.
- **Acceptance:** GIVEN a Basic account WHEN the player opens video quizzes THEN they are not available and no ad is shown; GIVEN a Premium account without wearable opt-in WHEN a device syncs THEN 0 data points are ingested.

### REQ-005: Billing and upgrade prompts live only in the parent account

- **Description:** Prices, billing and upgrade prompts appear only in the parent account. The upgrade prompt fires after the child's first Skill Tree milestone (deck S12) and is sent to the parent only. The player UI never shows a price. Spec refs: GR-06, decisions D5 and D7.
- **Falsifiable Hypothesis:** Keeping the child away from the transaction preserves trust (deck S13) and does not reduce conversion, because the parent is the buyer.
- **Test-for-Truth:** Run a UI test as the player across all screens. Trigger a milestone on a Basic account.
- **Acceptance:** GIVEN a player session WHEN any screen renders THEN 0 prices, billing items or upgrade prompts appear; GIVEN a Basic player who reaches the first milestone WHEN it is recorded THEN the parent receives exactly 1 upgrade prompt.

## Open Questions (carried from the spec)

- **OQ-1 (answered 2026-11-18):** The academy is in **Greece**, so EU GDPR applies.
  - Greece sets the age of digital consent at **15** (Law 4624/2019, Art. 21).
  - Coach verification is a Greek criminal record certificate checked by the academy. The owner has confirmed that the federation requirements are approved (2026-11-18). The plan assumes a 30-day renewal warning.
  - COPPA (US) and the UK Children's Code do not apply.
- **OQ-7 (answered 2026-11-18):** The age group is **15-year-olds**, so no one under 13 is in scope. The academy has approved use of the app, and that approval is the basis for `academy_consent_ref`.
  - Players who are 15 meet the consent age.
  - Any player in the group who is still 14 needs the academy's consent reference at onboarding. The consent-age setting is 15.
- **OQ-9 (answered 2026-11-18):** The academy curates the YouTube video links and writes a multiple-choice test for each, in parallel with the build. The build assumes both are ready at import. No AI drafts or analyses quizzes in v1. Videos are embedded, never downloaded, per YouTube's terms.
- **OQ-8 (answered 2026-11-18):** The player is always onboarded and keeps Basic features, whether or not the parent subscribes. The academy onboards every parent itself, so each player has a parent account from day one. Coach onboarding links the player to that account by email. A subscription only adds Premium. This makes Basic revenue depend on the academy's parent onboarding, so `premium-share` and paid Basic accounts should both be watched.
