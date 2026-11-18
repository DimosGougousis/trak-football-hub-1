# Player Tiers Spec

- **Features per tier:** Basic is the free-to-try gateway (core Skill Tree, manual entry, contextual ads). Standard is a deliberate decoy (more analytics, no automation). Premium is the target (AI video quizzes, wearable sync, ad-free, full parent ROI). No tier sells XP, Coach Coins, attribute points or badges.
- **Mandatory coach-player connections:** 12 (CP-01 to CP-12). The foundation is a verified coach linked to a roster with parent approval, because every progression feature (coach-signed tests, drills, Coach Coins, plans, video, rest override) is empty without it.
- **Status:** proposal for review. Sources: [deck-extract.md](deck-extract.md) (slides S1 to S15) and [research.md](research.md). Items marked "(rec.)" go beyond the deck and cite research.md.

## Decisions on deck inconsistencies

| # | Inconsistency | Decision | Why |
|---|---|---|---|
| D1 | Premium price: $29.99 (S1) vs $29 (S5) | **$29.99/mo.** Basic $9, Standard $25 unchanged. | S1 is the only slide showing the price on the product card; the $4.99 gap to Standard keeps the decoy visible. Finance to confirm. |
| D2 | Standard missing from the S11 matrix | Add a Standard column (see Feature Matrix). | S5 defines the tier; a decoy must be shown beside Premium to work. |
| D3 | Decoy vs streak discount (S9 vs S5) | Cap the streak discount so net Premium never drops below Standard's list price. Max 15% (15-day tier 10%, 30-day tier 15%). | At $29.99: 15% gives $25.49 (above $25, decoy holds); 30% gives $20.99 (below Standard, decoy breaks). At $29: 15% gives $24.65 and 30% gives $20.30, both below $25. Rule: net price = max(list x (1 - discount), Standard list price + $0.01). Alternative if marketing wants 30%: apply it to the $4.99 gap only. |
| D4 | Basic "hyper-targeted" ads vs COPPA and Children's Code (S6) | Contextual ads only for minors (rec.): no behavioural profiling, no under-13 targeting, no ad SDK that collects child data, ads shown in the parent area or as contextual placements, never interrupting a drill. | research.md §2: behavioural ads to under-13s are blocked by default (COPPA); profiling is off by default (Children's Code std 12). The 70/30 ads-to-fee mix is unverified and must be re-modelled. |
| D5 | S12 upgrade prompt fires after a child's milestone | The milestone is the trigger; the prompt is delivered to the parent account only (email or parent app). Never shown in the player UI. | S13 financial silo; Children's Code std 13 (research.md §2). |
| D6 | S9 streak discount vs S13 rest caps | Streak = active weeks, not consecutive days. Auto-freeze days count as kept. A discount can never require training on a rest day (rec.). Tier-clearing trigger (new Skill Tree tier) is kept as is. | A consecutive-day streak pushes children to skip rest (research.md §5). |
| D7 | Payer: parent (S2) vs academy bundle (S10) | Parent is the default billing party. In an Academy Bundle the academy is the billing party; the parent still owns consent, dashboard and the right to opt out. Bundled Premium is not eligible for streak discounts (no second payer to credit). | Two payers need one rule for consent vs billing; consent never moves to the academy. |
| D8 | Coach is an undefined actor | Define the Coach: a verified adult linked to a roster in an Academy. Verification status and expiry are stored (DBS in England, governing-body background check in the US). No verified status, no connection. | S3, S4, S8, S1, S10, S13 all depend on a coach (research.md §3). |
| D9 | Jurisdiction unknown | Design to the strictest common baseline: SafeSport MAAPP, FA Guidance 6.2, COPPA and the UK Children's Code, with GDPR Art. 8 age of consent handled per member state. Open question OQ-1. | Cheaper to relax later than retrofit. |
| D10 | Extra check: research.md says S9 states $29 | The extract does not show a price on S9; the $29 appears on S5 only. Does not change D1. | Flagged for the orchestrator. |

## Feature Matrix

| Feature | Deck ref | Basic | Standard | Premium |
|---|---|---|---|---|
| Player Card (Pace, Dribbling, Tactical Awareness) | S1, S3 | Core 3 attributes, coach-signed tests only | Core + history, coach-signed tests only | Full + AI-assisted trends; attributes still change only on coach-signed tests (GR-11) |
| Skill Tree | S3, S6 (rec. tier split) | Core tree | Core + extra branches | Full, adaptive |
| Closed Effort Leaderboard (academy squad only) | S3, S13 | Squad view | Squad view | Squad view + personal trends |
| Streak Freeze (automatic) | S3, S13 | Auto | Auto | Auto |
| Coach Coins (earned only) | S4, S8 | Earned | Earned | Earned |
| Cosmetic locker-room unlocks | S4, S8 | Earned only | Earned only | Earned only |
| Peer Kudos (preset messages) | S4 | Preset only (rec., research.md §2) | Preset only | Preset only |
| Parent Dashboard (Parental Insights) | S1 | Summary | Trends | Full ROI |
| Personalised Coaching Plan | S1 (rec. tier split) | — | Coach template | Personalised by coach + AI |
| Gamified Challenge | S1 (rec. tier split) | Weekly | Weekly + team | Weekly + team + custom |
| Advanced AI Analytics | S1, S5 | — | — | Full |
| Progress analytics (non-AI) (rec.) | S5 | Basic count | Trend charts | Included in AI Analytics |
| Ads (contextual only for minors) | S6, S11 (rec. contextual, research.md §2; Standard ads OQ-3) | Contextual | Contextual, reduced | — |
| Manual data entry | S6, S11 | Manual | Manual + coach entry | Manual as fallback |
| AI Video tactical quizzes | S7, S11 (rec. Standard view-only) | — | Coach clips, view only | Full 10-second clips + quizzes |
| Ad-Free experience | S7, S5 | — | — | Full |
| Wearable / hardware sync | S7, S11 | — | — | GPS vest, smart ball |
| Streak Discount (parent bill only) | S9 (rec. 15% cap vs deck 30%, D3; research.md §5) | — | — | Up to 15%, floor above Standard |
| Academy Bundle (academy billed) | S10 (rec. no streak discount, D7) | — | — | Optional |
| Physical Perks (tickets, clinics, merch) | S10, S11 | — | — | Included |
| Upgrade Prompt (parent only) | S12 | After first milestone, to parent | After a milestone, to parent | — |
| Rest Cap (daily XP cap, auto freeze) | S13 | Enforced | Enforced | Enforced |
| Financial Silo (no billing or nudges in player UI) | S13 | Enforced | Enforced | Enforced |
| Verified coach link and roster (rec.) | S13, research.md §3 | Required | Required | Required |
| Coach feedback, parent copied (rec.) | S1, research.md §2 | Required | Required | Required |

### Basic

- **Price / buyer:** $9/mo (S5), paid by the parent.
- **Purpose:** access. Let a skeptical parent see first engagement before paying more (S6).
- **Recommended features:** core Skill Tree, Player Card from coach-signed tests, manual entry, weekly challenge, closed squad leaderboard, kudos, summary dashboard, contextual ads.
- **Deliberately withheld (upgrade lever):** trends and charts, coaching plan, any automation, video, wearable sync, ad-free. Reason: Basic proves value; the parent pays for convenience and acceleration (S11).
- **Non-negotiables:** no pay-to-win, rest caps, closed leaderboards, financial silo, verified coach and parent consent.

### Standard

- **Price / buyer:** $25/mo (S5), paid by the parent.
- **Purpose:** the decoy. Visibly better than Basic, visibly worse value than Premium at $4.99 more.
- **Recommended features:** everything in Basic plus trend charts, extra Skill Tree branches, coach-entered data, a coach-template coaching plan, view-only coach-tagged clips, team challenges, reduced contextual ads.
- **Deliberately withheld (upgrade lever):** no wearable sync, no AI video quizzes, not ad-free, no Physical Perks, no streak discount, no personalised plan. Reason: the missing automation is the exact thing Premium sells (S5).
- **Non-negotiables:** the same as Basic. The tier is inferior, not hostile: no feature is removed from Basic.

### Premium

- **Price / buyer:** $29.99/mo (D1), parent or academy (D7).
- **Purpose:** the target. Acceleration and convenience (S11).
- **Recommended features:** all of Standard plus AI video tactical quizzes, wearable sync, advanced AI analytics, personalised coaching plan, full parent ROI dashboard, ad-free, Physical Perks, capped streak discount, optional Academy Bundle.
- **Deliberately withheld:** nothing in progression. Premium buys tools that help a child earn progression organically (S8), never the progression itself.
- **Non-negotiables:** the same as Basic. Wearable and video data are parent-consented and visible to the parent and the verified coach only.

## Mandatory Coach-Player Connections

| ID | Connection | Direction | Data | Trigger | Tiers | Safeguard |
|---|---|---|---|---|---|---|
| CP-01 | Verified coach and roster link | Academy → Coach → Player (parent approves) | Coach identity, verification status and expiry, roster ID | Academy invites coach; coach invites player by code | All | Coach unverified or expired means no link; parent approves each child link; parent can revoke at any time |
| CP-02 | Coach-signed testing updates Player Card | Coach → Player (parent copied) | Test result, date, attributes changed | Academy testing session ends (S3) | All | Only coach-signed tests change attributes; audit log; parent sees every change |
| CP-03 | Skill Tree drill assignment and sign-off | Coach → Player, Player → Coach | Drill, proof, sign-off, badge | Coach assigns or player submits proof | All | Proof reviewed by coach; submissions go to a shared drill log the parent sees by default, never a private player-to-coach channel; photo or video proof needs parent consent; no purchase path to badges |
| CP-04 | Coach Coins award for effort and teamwork | Coach → Player (parent copied) | Coin amount, reason | Coach awards after session (S8) | All | Daily cap, never purchasable, not tied to SKU; award reasons are logged and visible to the parent |
| CP-05 | Coach feedback and messaging | Coach → Player (parent copied) | Text feedback, no personal contact details | Coach posts feedback or replies | All | No private 1:1: parent or second adult copied on every message including replies; parent can revoke electronic contact (MAAPP, FA 6.2) |
| CP-06 | Personalised coaching plan | Coach → Player (parent copied) | Plan, weekly targets, load | Coach approves plan; Standard uses a template | Standard, Premium | Plan respects rest caps; parent sees the plan; coach review required for AI suggestions |
| CP-07 | Video tagging and AI quiz review | Coach → Player (parent copied) | 10-second clips, tags, quiz results | Coach uploads or tags clips (S7) | Premium | Parent consent for video of the child; storage and retention limits; no clips sent through private channels |
| CP-08 | Wearable data visibility | Player device → Coach and Parent | Sprint, load, heart-rate or GPS data | Device sync completes | Premium | Parent opt-in per data type; coach sees only roster players; data minimised; no sharing outside the academy; device data never changes attributes (GR-11) |
| CP-09 | Rest and load override | Coach → Player (parent copied) | Rest-day flag, load limit | Coach sees overload, or the rest cap triggers (S13) | All | Coach can only reduce load, never raise cap; the override freezes streaks automatically |
| CP-10 | Leaderboard scope by squad | Academy → Coach → Player | Squad membership, effort score | Roster change | All | Closed within the academy; coach defines squad; no public profile or export (S13) |
| CP-11 | Safeguarding report and escalation | Player, Parent or Coach → Academy welfare officer | Report text, evidence, involved accounts | Any user taps Report | All | Always visible and free on every tier; goes to the welfare officer, not the coach; coach cannot see who reported |
| CP-12 | Parent dashboard feed | Coach → Parent | Progress, coach notes, plan status | Weekly summary or milestone | All | Parent is the account owner; billing and upgrade content stays out of the player UI (S13) |

## Enforceable guardrail rules

| ID | Rule | Test |
|---|---|---|
| GR-01 | No SKU, discount, coupon or bundle may grant XP, Coach Coins, attribute points or badges. | Grep the entitlements config: no entitlement key writes to progression tables; neither billing code nor any Premium-only ingest (wearable, AI video) has a write path to attributes, XP or Coach Coins beyond the shared, tier-identical rules. |
| GR-02 | Daily XP cap is identical on every tier. | Same cap value across the three tier configs; test at the cap on each tier. |
| GR-03 | Streak freeze is automatic on rest days and after cap hits; discount logic counts frozen days as kept. | Simulate a rest week: streak and discount continue. |
| GR-04 | Net Premium price after discount is never below Standard list price plus $0.01. | Unit test the price function across all discount tiers. |
| GR-05 | Basic ads are contextual only for minors: no behavioural profile, no under-13 targeting, no SDK that collects child identifiers. | SDK allow-list in CI; network capture of a child session shows no third-party identifiers. |
| GR-06 | Upgrade prompts and billing data render only in the parent account. | UI test as player: no price, no prompt, no billing text. |
| GR-07 | A coach account without active verification cannot create a roster link or send a message. | Expire a coach in test data; the call is rejected. |
| GR-08 | Every coach-to-minor message copies a parent or second adult; no private 1:1 thread can exist. | Message API rejects missing recipient; test replies to athlete-initiated messages. |
| GR-09 | A parent revoking electronic contact stops all coach messages within one request. | Revoke, then post as coach: rejected. |
| GR-10 | Leaderboards are visible only inside the academy squad; no public URL or export. | Anonymous request returns 403. |
| GR-11 | Only coach-signed tests change Player Card attributes, on every tier. Self-logged drills earn XP only; device-synced data (Premium) feeds trends and informs the coach's next test but never writes attributes, so Premium has no second attribute path. | On a Premium account, submit a manual entry and a wearable sync: the attributes do not change until a coach signs a test. |
| GR-12 | Wearable, video and heart-rate data need explicit parent opt-in per data type. | No opt-in, no ingest. |

## Implementation sequencing

| Phase | Deck scope (S15) | Spec additions |
|---|---|---|
| P1 (days 1 to 30) | Tracking infra, Skill Trees, AI economic-value parameters | CP-01, CP-02, CP-03, CP-05, CP-10, CP-11, CP-12 and GR-07, GR-08, GR-09, GR-10, GR-11. Coach role and verification come first. |
| P2 (days 30 to 60) | Cosmetics, XP economy, youth-safe ad networks for Basic | CP-04, CP-09 and GR-01, GR-02, GR-03, GR-05. Ads go live only after GR-05 passes. |
| P3 (days 60 to 90) | Billing, Premium tiers, wearable sync, streak discounts | CP-06, CP-07, CP-08 and GR-04, GR-06, GR-12. Billing is switched on last. |

The deck's CTA (S15) says to finish the progression data pipelines before monetization. This spec adds that the connections above (at least CP-01 to CP-05, CP-09, CP-10) must exist before billing is switched on, otherwise paid tiers sell features with no coach behind them.

## Open questions

1. **OQ-1:** Which jurisdiction (US, UK, EU) does the academy operate in? It changes the verification rules and the age of consent.
2. **OQ-2:** Is $29.99 confirmed as the Premium price, and who owns the final decision?
3. **OQ-3:** Does Standard carry ads? The deck is silent; this spec recommends reduced contextual ads.
4. **OQ-4:** Who is the academy welfare officer, and is there one per academy?
5. **OQ-5:** What is the ads revenue model once ads are contextual? The 70/30 split is unverified.
6. **OQ-6:** Who verifies the coach in the US, and where is expiry stored? Not found in research.md §3.
7. **OQ-7:** Are players under 13 in scope? It changes consent flow.

## Next step

Start the formal loop with `/product-requirements player-tiers`. This spec is the input; it needs a success metric and kill criteria before approval.
