# Research Brief: Player Tiers and Coach-to-Player Connections

**Run:** yuup-2026-11-18-player-tiers · **Specialist:** research · **Date:** 2026-11-18

## Executive summary

Comparable youth-sport apps keep the team and coach layer free or coach-paid and charge parents or clubs for video and analytics. The strongest legal constraint is on the Basic tier. Ad-funded "hyper-targeted" ads to children (deck S6) conflict with COPPA's default block on third-party behavioural ads for under-13s and with the UK Children's Code's default-off profiling rule. Coach-to-minor messaging must copy a second adult or parent, and in England a regular coach of under-18s now needs an enhanced DBS check.

## Contradictions with the deck and contract

1. **Price:** Premium is $29.99 on S1 but $29 on S5 and S9. Spec must pick one.
2. **Standard tier:** S5 defines it, but S11 (the feature matrix) omits it. The contract's matrix needs a Standard column.
3. **Decoy vs discount:** At $29, a 15% streak discount gives $24.65 and a 30% discount gives $20.30. Both are below Standard's $25. At $29.99 the 15% discount gives $25.49, so the decoy survives only at the smaller discount (arithmetic from S1/S5/S9).
4. **Basic ads vs child privacy:** S6 says "hyper-targeted" ads on a child-used product. See section 2.
5. **Upgrade prompt (S12) vs nudge rule:** S12 fires the upgrade prompt after a child's milestone. The Children's Code (standard 13) bars nudges that steer children toward data sharing. S13 says upgrade nudges are siloed from the player UI, so the spec must route the prompt only to the parent account.
6. **Streak discount (S9) vs rest caps (S13):** A 30-day streak discount rewards the child for consistency, while S13 caps XP and freezes streaks to prevent overtraining. The mechanic can push a child to skip rest.
7. **Payer ambiguity:** S2 says the parent pays, but S10 bundles Premium into the academy registration fee. Spec must say who the billing party is.
8. **Coach actor is undefined:** Coach Coins (S4, S8), academy testing (S3), and "Personalized Coaching Plans" (S1) all need a coach role that the deck never defines.
9. **Market jurisdiction unknown:** The deck is in USD. Nothing says whether the academy is US, UK or EU, so the spec cannot choose a law set yet. Open question.

## 1. Benchmarks

| App | Tiering observed | Who pays | Confidence |
|---|---|---|---|
| TeamSnap (soccer) | Free team tier; TeamSnap+ is a per-user paid add-on; MLS NEXT training plans sit behind it | Coach/club base; per-user add-on | Medium (vendor page snippet) |
| Techne Futbol | Free download with trial; Monthly Fundamentals $9.99, Annual $279.99 (App Store); older listing $37.99/mo; prices vary by country | Individual (parent/player) | Medium (App Store snippet) |
| CoachNow | Analyze video tier $9.99/mo or $59.99/yr, 7-day trial | Coach-facing | Medium (help centre snippet) |
| Hudl | Four plan categories; "Club & Youth" is the only youth option; no prices or parent plan shown | Club/school | High on structure, no prices |
| Veo | Starter, Team, Club, Veo Go, Enterprise; monthly to 2-yearly billing; no free tier shown | Club/team | High on structure, no prices |
| Dribble Up, Strava-style kudos, Catapult/PlayerData | Not verified | Unverified | Low |

Sources: [TeamSnap soccer](https://www.teamsnap.com/teams/sports/soccer), [TeamSnap+ blog](https://www.teamsnap.com/blog/announcements/next-level-soccer-training-is-now-yours), [Techne Futbol App Store](https://apps.apple.com/app/id1298569303), [CoachNow Analyze](https://help.coachnow.io/en/articles/8534029-what-s-the-price-of-coachnow-analyze), [Hudl pricing](https://www.hudl.com/pricing), [Veo pricing](https://www.veo.com/pricing).

**Pattern:** The base team layer is free or coach-paid. Paid analytics and video sit with the coach, club or team, and per-user add-ons are common. No benchmark found charges a child-facing progression paywall, which matches S8. Basic at $9 sits at the price of the coach-facing CoachNow and Techne tiers; no benchmark was found for a parent-funded youth tier.

## 2. Coach-to-minor safeguarding norms

**US SafeSport / MAAPP** (USA Swimming version, fetched):

- Adult-to-minor electronic messages must be professional.
- One-on-one messages must copy a parent or another adult family member, including replies to athlete-initiated messages.
- No private direct messages to minors through social media; no new personal social-media connections with them.
- Group messages must copy another adult.
- A parent's written request to stop electronic contact must be honoured.

Sources: [USA Swimming MAAPP (via GoMotion)](https://www.gomotionapp.com/team/macca/page/safe-sport/maapp-minor-athlete-abuse-prevention-policy) (High for that version). [SafeSport one-pager](https://uscenterforsafesport.org/wp-content/uploads/2020/11/MAAPP_OnePagers_Communication_Final.pdf) and [LSA MAAPP](https://www.playlouisianasoccer.org/wp-content/uploads/sites/205/2025/03/LSA-Minor-Athlete-Abuse-Prevention-Policy-MAAPP.pdf) were read from snippets only. Each sport adopts its own version; check the governing body's current text.

**UK FA Guidance Note 6.2 (Digital Communications with U18s)** (snippet level): messages to under-18 players copy a parent/carer or the Welfare Officer; no social-media friendships with under-18 players; online sessions observable and interruptible. The Football Association of Wales bans private one-to-one messages with under-18s (snippet). Confidence Medium. Source: [FA 6.2 (2025 version)](https://www.thefa.com/-/media/thefacom-new/files/rules-and-regulations/safeguarding/21-10-2025/62-digital-communications-and-children-u18s.ashx).

**COPPA (US, under 13).** The amended Rule took effect 23 June 2025, compliance by 22 April 2026. Targeted advertising needs separate verifiable parental consent, and access cannot be conditioned on giving it. Consent is opt-in, so behavioural ads are blocked by default. Confidence Medium. Source: [Jones Day summary](https://jonesday.com/en/insights/2025/05/ftc-finalizes-amendments-to-coppa--rule).

**GDPR Art. 8 (EU/EEA).** Age for consent to online services is 16; member states may lower it to no less than 13. Controllers must make reasonable efforts to verify parental consent. Confidence Medium. Source: [Advisera Art. 8](https://advisera.com/gdpr/conditions-applicable-to-childs-consent-in-relation-to-information-society-services/).

**UK Age Appropriate Design Code (Children's Code)** (ICO FAQ snippets): Standard 7 high-privacy default; Standard 12 profiling off by default for children; Standard 13 no nudges steering children toward giving up data or weakening privacy. Confidence Medium. Source: [ICO standards FAQ](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/faqs-on-the-15-standards-of-the-children-s-code/).

**Implication for S6 (Basic ads): a conflict, not a tuning issue.** Behavioural targeting of under-13s is blocked by default under COPPA, and profiling-based ads are default-off under the Children's Code. Recommendation (judgement): Basic ads for minors are contextual only, with no behavioural profiles, no under-13 targeting, and no ad SDKs that collect child data. The deck's 70/30 ads-to-fee split is unverified: at $9 with a 30% fee share it implies roughly $21 per user per month of ad revenue, implausible for contextual youth ads, but no benchmark confirms it either way.

## 3. Coach verification

**England.** From 1 September 2026 the supervision exemption for regulated activity is removed. A coach working with children on more than 3 days in any 30-day period, or overnight, needs an Enhanced DBS check with children's barred-list information, even if supervised. Confidence High. Source: [gov.uk change notice](https://www.gov.uk/government/news/change-to-the-definition-of-regulated-activity-with-children-from-1-september-2026). The FA lists a football coach of under-18s as eligible for that check ([FA DBS checks](https://www.thefa.com/-/media/thefacom-new/files/rules-and-regulations/safeguarding/section-3/180326/32-the-fa-dbs-checks.ashx), snippet).

**US.** Background-check requirements sit in the MAAPP for sanctioned programmes. Unverified.

**Linking coach to player.** No source found. Standard patterns (recommendation only, unverified): club-issued roster, invite code tied to a verified coach account, parent approval for each child link.

**Spec implication:** a verified coach role gates every coach-to-player connection, recording verification status and expiry.

## 4. Data-integrity patterns

- Device data beats self-report: [US 8,983,637](https://insight.rpxcorp.com/pat/US8983637B2) (patent not read).
- Strava removed more than three million activities after finding car trips logged as workouts: [Marathon Handbook](https://marathonhandbook.com/strava-deletes-millions-of-workouts-after-cheating-cleanup/) (secondary).
- Coach-reviewed proof (photo/video, device import): [GymRats](https://help.gymrats.app/en/articles/10542253-check-in-verification), [WayBetter](https://support.waybetter.app/hc/en-us/articles/4411577545235-How-do-I-verify-that-I-did-the-activity), [MyWhoosh](https://www.mywhoosh.com/vital-role-of-verification-processes-in-indoor-cycling).
- Manual entry is the weak point; keep the cheatable share small ([Fitness Challenge blog](https://bkomplete.challengerunner.com/Blog/Fitness-Challenge-Cheating), low quality).

**Recommendation (judgement):** trust tiers. Only coach-signed test results change Player Card attributes (S3). Self-logged drills earn XP, not attributes. Device-synced data is the highest trust tier. Coach sign-off is auditable; flagged entries are reviewed. S8 needs an explicit ban on purchased attributes or Coach Coins.

## 5. Pricing risk notes

- **Decoy stability:** the decoy works only if Standard stays above discounted Premium. 15% or 30% discounts break it at $29. Options: cap discounts below the gap, drop the decoy, or discount only the Premium-minus-Standard gap.
- **Discount triggers child behaviour:** keep the discount on the parent's bill and out of the child's UI; streak rules must not penalise rest days (S13).
- **Under-13 ad monetisation:** blocked for behavioural ads (COPPA), default-off for profiling (Children's Code). Basic revenue assumptions in S6 need re-modelling.
- **Benchmark anchor:** Techne's $9.99/mo is the only parent-visible benchmark found; unverified as a demand signal.

## Gaps and unknowns

- Target jurisdiction (US, UK, EU) is not in the deck; each rule set changes the spec.
- SafeSport, FA 6.2 and ICO texts were read from snippets, not full documents.
- Dribble Up, Veo payer model and Catapult/PlayerData pricing not verified.
- No source for coach-player linking patterns.
- The 70/30 ad revenue assumption has no benchmark.

## Recommendations for the spec

1. Pick one Premium price and add a Standard column to the matrix.
2. Basic ads contextual only for minors, no behavioural profiling (beyond the deck).
3. Route the S12 upgrade prompt to the parent account only.
4. Add a rest-day rule to the S9 streak discount, or drop the child-triggered trigger.
5. Gate every coach-player connection on a verified coach role, with DBS status where applicable.
6. Require parent copy or a second adult on any coach-to-minor message, and let parents revoke electronic contact.
