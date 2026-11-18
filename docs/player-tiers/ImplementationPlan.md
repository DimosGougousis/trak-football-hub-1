---
name: player-tiers
status: approved
---

# Implementation Plan: Player Tiers

## Summary

- **Mode:** Hold Scope. Build exactly the Basic + Premium wedge in `ProductRequirements.md`, with nothing added.
- **Solution:** `ProposedSolution.md`. Approach A is a modular monolith: a Java/Spring backend, a player app, a coach app, and a parent web account.
- **Kill criteria:** see `ProductRequirements.md`, Kill Criteria. Weekly active players below 30% on 2027-07-31.
- **Target launch:** 2027-06-01 at the partner academy.
- **Codebase assumption:** a new repository, `player-tiers-app`.
  - Stack: Java 21, Spring Boot 3, Gradle, JUnit 5, MockMvc and Testcontainers PostgreSQL.
  - Package root: `com.academy.tiers`.
  - Every test command runs from that repository's root.
- **Onboarding (amended 2026-11-18):** a verified coach onboards players directly, with no parent approval step. Consent for minors comes from the academy's registration, via `academy_consent_ref`. The parent is notified and can revoke.
- **Jurisdiction (OQ-1 and OQ-7 answered 2026-11-18):** Greece and EU GDPR.
  - The consent age is 15 (Law 4624/2019, Art. 21), and the age group is 15-year-olds.
  - Coach verification uses a Greek criminal record certificate, `GR_CRIMINAL_RECORD`.
  - The consent-age setting stays configurable and fails closed (`422 consent_required` while unset). Milestone 6 sets it to 15.
- **Open blockers carried forward:** none. Before production, check each wearable vendor's minimum-age terms for 15-year-olds (Milestone 5).

## Nyquist Coverage Map

| Requirement | Positive Test | Negative/Edge Test | Status |
|---|---|---|---|
| REQ-001 | `RosterLinkTest.verifiedCoachOnboardsPlayerAndParentIsNotified` | `RosterLinkTest.expiredCoachOnboardingIsRejectedWith403AndNoLink` | PASS |
| REQ-002 | `ProgressionTest.coachSignedTestUpdatesAttributesAndAuditLog` | `ProgressionTest.premiumDrillAndWearableSyncChangeNoAttributes` | PASS |
| REQ-003 | `MessagingTest.coachMessageCopiesEveryLinkedParent` | `MessagingTest.messageWithNoParentRecipientIsRejectedWith422` | PASS |
| REQ-004 | `EntitlementTest.premiumAccountCanCallVideoAndWearableEndpoints` | `EntitlementTest.wearableSyncWithoutOptInIngestsZeroSamples` | PASS |
| REQ-005 | `UpgradePromptTest.firstMilestoneSendsExactlyOnePromptToParent` | `FinancialSiloTest.playerTokenOnBillingEndpointsReturns403` | PASS |

Additional edge tests are named in each milestone plan. Examples: the revoke test (REQ-001), the daily XP cap (REQ-002), the weekly feed (REQ-003), the Basic account getting `402` (REQ-004) and a player UI that shows no price (REQ-005).

## Milestones

### Milestone 1: Identity, coach verification, roster and consent

Plan: `plans/2026-11-18-milestone-1.md`
Dependencies: None

- [ ] Task 1.1: Set up the project skeleton, with Testcontainers Postgres and Flyway — `build.gradle.kts`, `src/main/resources/db/migration/V1__identity.sql` — `./gradlew build`
- [ ] Task 1.2: Test (failing) for the coach verification record and its expiry — `src/test/java/com/academy/tiers/verification/CoachVerificationTest.java` — `./gradlew test --tests '*CoachVerificationTest'`
- [ ] Task 1.3: Implement the verification module — `src/main/java/com/academy/tiers/verification/*` — `./gradlew test --tests '*CoachVerificationTest'`
- [ ] Task 1.4: Test and implement academy bulk onboarding of parents (`POST /academies/{id}/parents`), plus the `422 parent_not_onboarded` check on player onboarding (OQ-8) — `src/main/java/com/academy/tiers/roster/ParentOnboardingController.java`, `src/test/java/com/academy/tiers/roster/ParentOnboardingTest.java` — `./gradlew test --tests '*ParentOnboardingTest'`
- [ ] Task 1.5: Tests (failing) for REQ-001, positive and negative, plus revoke — `src/test/java/com/academy/tiers/roster/RosterLinkTest.java` — `./gradlew test --tests '*RosterLinkTest'`
- [ ] Task 1.6: Implement direct coach onboarding (active link at once, parent notified) and parent revoke, with the verification gate (GR-07) — `src/main/java/com/academy/tiers/roster/*` — `./gradlew test --tests '*RosterLinkTest'`
- [ ] Task 1.7: Test and implement the consent-age setting with the academy consent reference, which fails closed with `422 consent_required` — `src/main/resources/application.yml`, `src/test/java/com/academy/tiers/roster/ConsentAgeTest.java` — `./gradlew test --tests '*ConsentAgeTest'`
- [ ] Task 1.8: Add the audit log for links and consent — `src/main/java/com/academy/tiers/audit/*` — `./gradlew test --tests '*RosterLinkTest'`

### Milestone 2: Progression, drills and the success metric

Plan: `plans/2026-11-18-milestone-2.md`
Dependencies: Milestone 1

- [ ] Task 2.1: Tests (failing) for REQ-002, positive and negative — `src/test/java/com/academy/tiers/progression/ProgressionTest.java` — `./gradlew test --tests '*ProgressionTest'`
- [ ] Task 2.2: Implement the coach-signed test endpoint as the only path that writes attributes (GR-11) — `src/main/java/com/academy/tiers/progression/TestResultService.java` — `./gradlew test --tests '*ProgressionTest'`
- [ ] Task 2.3: Implement drill logging that awards XP only — `src/main/java/com/academy/tiers/progression/DrillService.java` — `./gradlew test --tests '*ProgressionTest'`
- [ ] Task 2.4: Test and implement the daily XP cap and automatic streak freeze (GR-02, GR-03) — `src/test/java/com/academy/tiers/progression/XpCapTest.java` — `./gradlew test --tests '*XpCapTest'`
- [ ] Task 2.5: Emit the `drill_logged` and `test_signed` events, and the `weekly-active-players` query — `src/main/java/com/academy/tiers/analytics/*`, `src/test/java/com/academy/tiers/analytics/WeeklyActivePlayersTest.java` — `./gradlew test --tests '*WeeklyActivePlayersTest'`
- [ ] Task 2.6: Add an architecture test that only `TestResultService` writes to the attributes table — `src/test/java/com/academy/tiers/ArchitectureTest.java` — `./gradlew test --tests '*ArchitectureTest'`

### Milestone 3: Messaging and the parent feed

Plan: `plans/2026-11-18-milestone-3.md`
Dependencies: Milestone 1

- [ ] Task 3.1: Tests (failing) for REQ-003, positive and negative, plus a player reply — `src/test/java/com/academy/tiers/messaging/MessagingTest.java` — `./gradlew test --tests '*MessagingTest'`
- [ ] Task 3.2: Implement a server-side recipient rule with no private-thread type (GR-08) — `src/main/java/com/academy/tiers/messaging/*` — `./gradlew test --tests '*MessagingTest'`
- [ ] Task 3.3: Test and implement revoking electronic contact (GR-09) — `src/test/java/com/academy/tiers/messaging/ContactRevokeTest.java` — `./gradlew test --tests '*ContactRevokeTest'`
- [ ] Task 3.4: Test (failing) for the weekly feed of drills, XP, tests and notes — `src/test/java/com/academy/tiers/feed/ParentFeedTest.java` — `./gradlew test --tests '*ParentFeedTest'`
- [ ] Task 3.5: Implement the weekly feed batch and email — `src/main/java/com/academy/tiers/feed/*` — `./gradlew test --tests '*ParentFeedTest'`

### Milestone 4: Entitlements, billing and the financial silo

Plan: `plans/2026-11-18-milestone-4.md`
Dependencies: Milestones 2 and 3

- [ ] Task 4.1: Test (failing) for loading `entitlements.yaml`: Basic at $9.00, Premium at $29.99, no plan writes progression — `src/test/java/com/academy/tiers/entitlements/EntitlementsConfigTest.java` — `./gradlew test --tests '*EntitlementsConfigTest'`
- [ ] Task 4.2: Implement the entitlements module and the gateway check (`402 tier_required`) — `src/main/resources/entitlements.yaml`, `src/main/java/com/academy/tiers/entitlements/*` — `./gradlew test --tests '*EntitlementsConfigTest'`
- [ ] Task 4.3: Tests (failing) for REQ-005, negative (a player token gets 403) and UI checks — `src/test/java/com/academy/tiers/billing/FinancialSiloTest.java` — `./gradlew test --tests '*FinancialSiloTest'`
- [ ] Task 4.4: Implement Stripe checkout and an idempotent webhook, both parent-only — `src/main/java/com/academy/tiers/billing/*` — `./gradlew test --tests '*FinancialSiloTest' --tests '*StripeWebhookTest'`
- [ ] Task 4.5: Test (failing) for REQ-005, positive: one upgrade prompt to the parent at the first milestone — `src/test/java/com/academy/tiers/billing/UpgradePromptTest.java` — `./gradlew test --tests '*UpgradePromptTest'`
- [ ] Task 4.6: Implement the milestone-to-prompt listener and the `premium-share` guardrail query — `src/main/java/com/academy/tiers/billing/UpgradePromptListener.java`, `src/main/java/com/academy/tiers/analytics/PremiumShareQuery.java` — `./gradlew test --tests '*UpgradePromptTest' --tests '*PremiumShareTest'`

### Milestone 5: Premium modules behind feature flags

Plan: `plans/2026-11-18-milestone-5.md`
Dependencies: Milestone 4

- [ ] Task 5.1: Tests (failing) for REQ-004, positive and negative, plus a Basic account getting `402` — `src/test/java/com/academy/tiers/premium/EntitlementTest.java` — `./gradlew test --tests '*EntitlementTest'`
- [ ] Task 5.2: Implement wearable ingest with the first adapter, Whoop or Fitbit (whichever API access is ready first; the other follows behind the same interface), with a per-type opt-in check (GR-12) — `src/main/java/com/academy/tiers/premium/wearable/*` — `./gradlew test --tests '*EntitlementTest'`
- [ ] Task 5.3: Implement the curated YouTube training library: bulk import of video links with their multiple-choice tests (each link checked as embeddable with the Data API, stored as ID, metadata and questions only), player answer scoring for XP under the cap, and a nightly availability check — `src/main/java/com/academy/tiers/premium/video/*`, `src/test/java/com/academy/tiers/premium/VideoLibraryTest.java` — `./gradlew test --tests '*VideoLibraryTest'`
- [ ] Task 5.4: Test that switching off either flag gives a Basic-only fallback with no data loss — `src/test/java/com/academy/tiers/premium/FeatureFlagFallbackTest.java` — `./gradlew test --tests '*FeatureFlagFallbackTest'`
- [ ] Task 5.5: Run the full regression, including `ProgressionTest`, to confirm that Premium ingests do not touch attributes — all tests — `./gradlew test`

### Milestone 6: Launch readiness at the partner academy

Plan: `plans/2026-11-18-milestone-6.md`
Dependencies: Milestone 5

- [ ] Task 6.1: Set the Greece configuration: consent age 15, verification type `GR_CRIMINAL_RECORD` — `src/main/resources/application-prod.yml` — `./gradlew test --tests '*ConsentAgeTest'`
- [ ] Task 6.2: Rehearse the Basic-only fallback in staging with both Premium flags off — staging config — `./gradlew test --tests '*FeatureFlagFallbackTest'`
- [ ] Task 6.3: Seed the academy roster, verify the coaches, and run an end-to-end test of the sequence in `diagrams/sequence.dot` — `src/test/java/com/academy/tiers/e2e/PrimaryFlowE2ETest.java` — `./gradlew test --tests '*PrimaryFlowE2ETest'`
- [ ] Task 6.4: Check that the `weekly-active-players` and `premium-share` queries return values on seeded data — `src/test/java/com/academy/tiers/analytics/*` — `./gradlew test --tests '*WeeklyActivePlayersTest' --tests '*PremiumShareTest'`
