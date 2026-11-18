# player-tiers-app

Backend for **Player Tiers**: a youth football academy app where coaches, players and parents share a verified training record. Players earn progress through drills and coach-signed tests, and parents see it and pay for Premium tools.

The product package lives in the Product Office repository at `pipeline/active/player-tiers/`. It contains:

- the requirements, REQ-001 to REQ-005
- the approved solution and its diagrams
- the implementation plan, with per-milestone TDD plans in `plans/`

## Stack

Java 21, Spring Boot 3.3, Gradle, PostgreSQL 16, Flyway, JUnit 5, MockMvc and Testcontainers.

## Build and test

No local Java is needed. Gradle runs inside Docker, and Testcontainers starts Postgres through the host's Docker engine.

```bash
scripts/gradle.sh test
scripts/gradle.sh test --tests '*RosterLinkTest'
```

The only requirement is a running Docker engine (Docker Desktop 4.x or Engine 29+).

To run the app itself, set `TIERS_JWT_SECRET` to an HS256 secret of at least 32 bytes. It has no default, so the app refuses to start without it. Use the `prod` profile for Greece's consent age of 15. Without a profile, the consent age is unset and onboarding fails closed.

## Rules the code enforces

These rules have tests that must pass before any pull request:

- **No pay-to-win:** only coach-signed tests change Player Card attributes, on every tier (ADR-002).
- **Financial silo:** prices and billing exist only in the parent account (ADR-003).
- **Verified coaches only:** a coach without an active check cannot onboard players or send messages (GR-07).
- **Parents copied:** every coach message, and every reply, copies all of a player's parents. Private one-to-one threads cannot exist (GR-08). Parents can revoke contact (GR-09).
- **Consent fails closed:** onboarding is refused until the consent age is configured. A player under it needs the academy's consent reference (Greece: 15).

## Branching

Every change reaches `main` through a reviewed pull request. AI-written code is allowed for Milestones 1 to 3 under Product Office ADR-004, and the owner reviews and merges each PR.
