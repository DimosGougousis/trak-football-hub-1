---
name: player-tiers
status: approved
approved_by: Dimos Gougousis
---

# Proposed Solution: Player Tiers

## Selected Approach

**Approach A: modular monolith.** One Java/Spring backend holds the core modules as separate packages:

- identity and roles
- coach verification
- roster and consent
- progression
- messaging
- parent feed
- entitlements
- billing
- audit

Three clients sit on top: a player mobile app (with no prices or billing), a coach app, and a parent web account that owns billing, consent and the feed.

Premium's AI video and wearable sync are two feature-flagged modules, each with an adapter to a single vendor. If either misses 2027-06-01, launch goes ahead as Basic only, as `CEOApproval.md` (Hold Scope) allows.

Sources: `ProductRequirements.md` (REQ-001 to REQ-005), `CEOApproval.md`, and the tier spec in `pipeline/active/yuup-2026-11-18-player-tiers/player-tiers-spec.md` (CP and GR ids).

## Alternatives Considered

### Approach A: Modular monolith (selected)

**Summary:** One backend with module boundaries, entitlements from a Pricing4YAML file (deck S15), Stripe on the parent web account, and Premium integrations behind adapters.
**Pros:** Safeguarding rules (parent copy, verification gate, single attribute write path) are ordinary code that unit tests can enforce. One deploy. Premium can be switched off without a release. It matches the deck's Pricing4Java/Pricing4YAML plan.
**Cons:** More upfront build than a backend-as-a-service. The modules share one database, so the boundaries need discipline.
**Best when:** Compliance rules must be provable, the team is small, and there is one partner academy.
**Risk level:** Medium.

### Approach B: Backend-as-a-service (Supabase or Firebase + Flutter)

**Summary:** Auth, database and functions come from a managed platform. Rules are written as row-level security policies.
**Pros:** Fastest start, with little infrastructure.
**Cons:** The rules that matter (parent copy, no private 1:1 chats, attributes changed only by a coach-signed test) become database policies, which are harder to test and audit. Vendor lock-in. Billing and AI vendor glue still need custom functions.
**Best when:** The prototype has no compliance burden.
**Risk level:** Medium-High.

### Approach C: Build on an existing club platform (TeamSnap, Spond)

**Summary:** Roster and messaging come from the club platform. We build only progression and Premium.
**Pros:** The least to build.
**Cons:** GR-08 (parent copied) and REQ-001 (verification gate) sit outside our control. We depend on the partner's API and terms. The parent experience is split across two apps.
**Best when:** The academy already runs on that platform and only wants an add-on.
**Risk level:** High (compliance).

## Component Diagram

Source: [diagrams/component.dot](diagrams/component.dot).

- **Clients:** player app, coach app, parent web account and academy admin. All of them go through one API gateway, which checks the JWT, the role and the entitlement.
- **Core modules:**
  - Coach Verification gates Roster.
  - Roster gates Progression, Messaging and the Premium ingests.
  - Billing sets Entitlements.
  - An in-process event bus feeds the Parent Feed and the Audit log.
- **External:** Stripe, the YouTube Data API and embedded player, one wearable vendor at a time (Whoop or Fitbit, both through the same `WearableVendor` interface), and email or push. Each vendor sits behind an adapter.
- **Stores:** PostgreSQL only. The video library stores YouTube video IDs and metadata, never video files.

## Sequence Diagram

Source: [diagrams/sequence.dot](diagrams/sequence.dot). This is the primary flow.

1. The academy invites a coach.
2. The coach's verification check and its expiry are recorded.
3. The coach onboards the player directly, with the parent's email and the academy's consent reference. The link is active immediately.
4. The academy has already onboarded the parent. The link attaches to that parent account, and the parent is notified. The player has Basic features from now on; a subscription only adds Premium. The parent can revoke the link at any time.
5. The player app is activated.
6. The coach assigns drills.
7. The player logs a drill and earns XP.
8. The coach signs a test.
9. The Player Card attributes update, and the change goes to the audit log.
10. The coach sends feedback, with the parent copied.
11. The player reaches the first milestone.
12. The upgrade prompt goes to the parent only.
13. The parent upgrades to Premium on the web.
14. Entitlements switch to Premium. The player gets the YouTube training library and its quizzes, and the parent opts in to wearables.
15. The weekly parent feed goes out.

## Data Flow

Source: [diagrams/data-flow.dot](diagrams/data-flow.dot).

- **Inputs:** coach-signed tests, self-logged drills, coach messages, consent, Stripe events, wearable syncs, and YouTube video IDs with the coach's timestamped notes.
- **Transformations:**
  - Attribute update is the **only** writer of attributes.
  - XP and the Skill Tree apply the daily cap and freeze the streak automatically.
  - The recipient rule adds the parents.
  - Tier resolution sets Basic or Premium.
  - Trend calculation is display-only.
  - Library import checks each curated YouTube link is embeddable and stores it with its multiple-choice test. Scoring a player's answers awards XP under the daily cap and never changes attributes (ADR-002).
  - Weekly aggregation produces the feed and the metric.
- **Stores:** progression, messages, roster and consent, entitlements, device data, the video library (IDs, metadata and quizzes), the audit log and analytics events.
- **Outputs:** the Player Card, the parent feed, the upgrade prompt (parent only), the coach roster view, and the `weekly-active-players` metric.

## Interface Contracts

All endpoints use REST/JSON over HTTPS with a JWT bearer token. Every endpoint checks the role. Premium endpoints also check the entitlement and return `402 tier_required` on Basic.

| Endpoint | Caller | Request | Response | Errors |
|---|---|---|---|---|
| `POST /coaches/{id}/verification` | academy admin | `{ "type": "GR_CRIMINAL_RECORD", "reference", "expires_on" }` (other types are configurable) | `201 { "status": "active", "expires_on" }` | `400` bad date; `403` not this academy's admin |
| `POST /academies/{id}/parents` | academy admin | `{ "parents": [{ "email", "name" }] }` (bulk) | `201 { "created": n, "existing": n }` | `403` not this academy's admin; `422` malformed email (the whole batch is rejected) |
| `POST /rosters/{rosterId}/players` | coach | `{ "player_first_name", "dob", "parent_email", "academy_consent_ref" }` | `201 { "player_id", "link_status": "active", "parent_notified": true }` | `403 coach_unverified` (none or expired, GR-07); `409` already linked; `422 consent_required` (consent-age setting unset, or the player is under it and `academy_consent_ref` is missing, OQ-1/OQ-7); `422 parent_email_required` (REQ-003 needs a parent recipient); `422 parent_not_onboarded` (no academy-onboarded parent account with that email, OQ-8) |
| `DELETE /links/{playerId}/coaches/{coachId}` | parent | none | `204` | `404` no link |
| `POST /players/{id}/tests` | coach | `{ "test_type", "results": {"pace":n,...}, "signed_at" }` | `201 { "attributes_changed": [...] }` | `403` not on roster or unverified; `422` result out of range |
| `POST /players/{id}/drills` | player | `{ "drill_id", "completed_at", "proof_url?" }` | `201 { "xp_awarded", "xp_today", "attributes_changed": [] }` | `429 daily_xp_cap` (counted, 0 XP); `422` future date |
| `POST /messages` | coach, player or parent | `{ "thread_id?", "to_player_id", "body" }` | `201 { "recipients": [coach, player, parent(s)] }` | `403 contact_revoked` (GR-09); `422 no_parent_recipient` (GR-08, rejected rather than sent) |
| `GET /parents/me/feed?week=YYYY-Www` | parent | none | `200 { "drills", "xp", "tests", "coach_notes" }` | `404` no linked player |
| `POST /billing/checkout` | parent | `{ "tier": "basic"\|"premium" }` | `200 { "checkout_url" }` | `403` called from a player token (REQ-005) |
| `POST /webhooks/stripe` | Stripe | Stripe event (signed) | `200` | `400` bad signature; idempotent per event id |
| `POST /players/{id}/wearables/sync` | device adapter | `{ "vendor", "samples": [...] }` | `202 { "ingested": n }` | `402 tier_required`; `403 opt_in_missing` (GR-12, 0 ingested) |
| `POST /library/import` | academy admin | `{ "videos": [{ "youtube_url", "skill_tree_node", "questions": [{ "text", "options": [4 strings], "answer_index": 0-3 }] }] }` | `201 { "imported": n, "updated": n }`; idempotent by YouTube ID | `422 not_youtube` (any other host); `422 not_embeddable` (private, removed or embedding disabled, checked with the YouTube Data API); `422 invalid_question` (not 2-6 options, or `answer_index` out of range). The batch is rejected as a whole and the error names the row |
| `GET /library/videos?node=` | player (Premium) | none | `200 [{ "video_id", "youtube_id", "title", "questions": [{ "text", "options" }] }]`, never including `answer_index` | `402 tier_required` |
| `POST /library/videos/{id}/answers` | player (Premium) | `{ "answers": [0-3, ...] }` | `200 { "correct": n, "total": n, "xp_awarded" }` (XP under the daily cap, attributes unchanged) | `402`; `422` wrong number of answers |

**Entitlements file** (`entitlements.yaml`, Pricing4YAML-style):

```yaml
plans:
  basic:   { price_usd: 9.00,  features: [skill_tree, player_card, drills, coach_feedback, parent_feed] }
  premium: { price_usd: 29.99, features: [skill_tree, player_card, drills, coach_feedback, parent_feed,
                                          video_library, wearable_sync, advanced_analytics] }
flags:
  video_library: { enabled: true }   # off => Premium falls back to Basic features
  wearable_sync:    { enabled: true }
rules:
  progression_write_by_entitlement: false   # GR-01: no plan writes progression
  daily_xp_cap: 300                          # GR-02: identical on every plan
```

**Analytics events:** `drill_logged {player_id, roster_id, week}`, `test_signed`, `tier_changed`, `upgrade_prompt_sent`. These feed `weekly-active-players` and the guardrail metric below.

## Edge Cases

1. **Empty or malformed test result** (a missing attribute, or a value out of range) → `422`, nothing written, and the coach sees which field failed.
2. **A drill logged with a future date or a duplicate** → `422` for a future date; a duplicate by `(player, drill, day)` is idempotent and awards no extra XP.
3. **Daily XP cap reached** → the drill still counts toward `weekly-active-players`, earns 0 XP, and the streak is not broken (GR-02, GR-03).
4. **Coach verification expires mid-season** → existing links freeze to read-only and new tests and messages return `403`. The academy admin gets a warning 30 days before expiry.
5. **A parent revokes the coach link or electronic contact** → it takes effect on the next request. Queued coach messages to that player are dropped, and the drop is audited.
6. **Player with two parents or guardians** → both are copied on every message. Either can revoke contact. Billing belongs to the parent who pays.
7. **Player replies to a coach** → the reply is routed through the same recipient rule, so the parent is copied (MAAPP covers athlete-initiated messages too).
8. **Stripe payment fails or is downgraded** → the tier drops to Basic at the end of the period. Premium data is kept but hidden, and progression is untouched.
9. **Stripe webhook is late or duplicated** → the handler is idempotent by event id. Tier resolution reads the latest Stripe state.
10. **The YouTube Data API is down during an import** → the import is rejected with `503` and nothing is stored, so the admin retries. Players keep the existing library. If the `video_library` flag is switched off, Premium falls back to Basic features with no data loss.
11. **Wearable sync arrives without opt-in, or for a Basic player** → `403` or `402`, with 0 data points ingested and no buffering.
12. **High load at the start of a training session** (a whole squad logs drills at once) → drill logging is a single insert plus an event, with no synchronous fan-out. Feed aggregation is a weekly batch.
13. **First player on a roster, or a roster of one** → leaderboards are hidden below 3 players, so a single child is never ranked.
14. **Last session of the season** → the season ends the roster but keeps history. Billing pauses only if the academy bundle applies; otherwise it continues.
15. **A player under the jurisdiction's consent age is onboarded without an academy consent reference** → `422 consent_required`, and nothing about the child is stored. The same happens for every player while the consent-age setting is unset (OQ-1, OQ-7).
16. **A player token calls a billing or upgrade endpoint** → `403`. The UI never renders those screens (REQ-005).
17. **The parent never opens the notification or never subscribes** → the player stays onboarded with Basic features, and messages still copy the parent (REQ-003). The academy onboarded the parent, so the account exists either way (OQ-8, answered).
19. **A coach onboards a player whose parent email has no academy-onboarded parent account** → `422 parent_not_onboarded`, and nothing is stored. The academy admin onboards the parent first.
18. **A library video is later removed, made private or has embedding disabled on YouTube** → a nightly check with the YouTube Data API hides it from players and flags it to the coach. The test and the players' past scores are kept, so the academy can re-import the entry with a replacement link.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Modular monolith (A) | Hold Scope and one partner academy. The safeguarding rules have to be code that unit tests can enforce. |
| Attribute writes | Only through `POST /players/{id}/tests` by a verified rostered coach | REQ-002, GR-11. One write path is easy to audit and stops Premium buying progression. |
| Billing surface | Stripe checkout on the parent web account only, never in-app | REQ-005 financial silo. It also avoids app-store purchase flows inside a child's app. |
| Premium integrations | Wearables use Whoop or Fitbit behind one `WearableVendor` adapter interface, with the curated YouTube library. Each is behind a feature flag. | Limits the feasibility risk (score 2). If one is late, Premium switches off with no release. |
| Messaging | Server-side recipient rule; an API with no private-thread type at all | GR-08. It is enforced by construction, not by UI. |
| Consent age | Configured per jurisdiction and blocking until set. Greece sets 15. | OQ-1 and OQ-7 answered 2026-11-18: Greece, GDPR Art. 8 with Law 4624/2019 Art. 21; the age group is 15-year-olds; the academy has approved use. Players still 14 need `academy_consent_ref`. |
| Guardrail metric | Add `premium-share`: Premium accounts ÷ active parent accounts, from `tier_changed` events | `CEOApproval.md` economics risk. It doesn't replace the success metric. |
| Leaderboards | Squad-only, hidden below 3 players | Deck S13. A child is never ranked alone. |
| Video source | A YouTube training library: videos are embedded by ID with YouTube's player and never downloaded. The academy curates the links and their multiple-choice tests, which are imported together. | Owner decisions on 2026-11-18. It follows YouTube's terms, which do not allow downloading. It removes all storage of footage of minors, and with it the video-consent flow and the object store. It also removes the AI quiz vendor (OQ-9). |
| Player onboarding | A verified coach onboards the player directly, with no parent approval step. The academy's consent reference is required under the consent age. The parent is notified and can revoke. | Owner decision on 2026-11-18 (REQ-001 amended). It overrides spec CP-01's parent-approval step. Consent for minors comes from the academy's registration instead. |

Two decisions constrain every future tier and are recorded as ADRs:

- the single attribute write path: `product/decisions/ADR-002-coach-signed-tests-only-attribute-write-path.md`
- parent-only billing: `product/decisions/ADR-003-billing-and-upgrade-prompts-parent-only.md`
