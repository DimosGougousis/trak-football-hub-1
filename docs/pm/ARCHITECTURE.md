# Architecture: Trak Football — Pilot Wedge
Locked: 2026-04-09
Approved by: founder
Mode: Hold Scope

---

## Selected Approach

**Approach A: Client-Heavy.** All computation (rating algorithm, band
mapping, medal checks, goal auto-updates) runs in the React client.
Supabase serves as a data store with RLS enforcement. No edge functions,
no DB triggers.

**Rationale:** The pilot has ~15 known players from a single club. Tamper
risk is zero. Speed to build is the priority. If the pilot succeeds (Q4
metric hit), harden to server-side computation (Edge Functions) before
onboarding club #2.

---

## Component Diagram

See `docs/pm/refs/diagrams/component.dot` for the full Graphviz source.

**Summary of layers:**

```
┌─────────────────────────────────────────────────────────┐
│  React App (Mobile Web, max 430px)                      │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Player   │  │  Coach   │  │  Parent  │  ← 3 role   │
│  │  Screens  │  │  Screens │  │  Screens │    clusters  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │             │                    │
│  ┌────┴──────────────┴─────────────┴────┐               │
│  │           Shared Layer               │               │
│  │  Rating Engine │ Medal Checker       │               │
│  │  Goal Updater  │ Telemetry Client    │               │
│  │  Component Library (BandPill, etc.)  │               │
│  └──────────────────┬───────────────────┘               │
│                     │ Supabase JS Client                │
└─────────────────────┼───────────────────────────────────┘
                      │ HTTPS (PostgREST API)
┌─────────────────────┼───────────────────────────────────┐
│  Supabase (Frankfurt)                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Auth    │  │ PostgreSQL│  │   RLS    │              │
│  │(email+pw)│  │ (10 tables│  │ Policies │              │
│  │          │  │  + views) │  │          │              │
│  └────┬─────┘  └──────────┘  └──────────┘              │
│       │                                                 │
│  ┌────┴─────┐                                           │
│  │  Resend  │  ← email confirmation only                │
│  │  SMTP    │                                           │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram — Primary Flow (Match Log)

See `docs/pm/refs/diagrams/sequence-match-log.dot` for the full
Graphviz source.

**Sequence summary (21 steps):**

```
Player → Form UI         1. Opens form
Form UI → Telemetry      2. fire(form_start)
Telemetry → DB           3. INSERT telemetry_events

Player → Form UI         4. Fills fields (each change triggers 5–6)
Form UI → Rating Engine  5. computeScore(inputs)
Rating Engine → Form UI  6. return { score, band } → live preview

Player → Form UI         7. Taps Save
Form UI → Rating Engine  8. computeScore(inputs) — final
Rating Engine → Form UI  9. return { score, band }
Form UI → Supabase       10. INSERT match (all fields + score + band)
Supabase → DB            11. INSERT INTO matches (RLS check)
DB → Supabase            12. OK + match row

Supabase → Telemetry     13. fire(form_submit + match_log)
Telemetry → DB           14. INSERT telemetry x2

Supabase → Goal Updater  15. checkAutoGoals(match)
Goal Updater → DB        16. SELECT + UPDATE goals

Supabase → Medal Checker 17. checkMedals(player_id)
Medal Checker → DB       18. SELECT history + existing medals
Medal Checker → DB       19. INSERT medal (if newly earned)

Supabase → Result UI     20. Navigate with { match, newGoals, newMedals }
Result UI → Player       21. Band reveal + cards
```

---

## Data Flow Diagram

See `docs/pm/refs/diagrams/data-flow.dot` for the full Graphviz source.

**Summary:**

```
INPUTS                    TRANSFORMS              STORES                OUTPUTS
─────────────────         ──────────────           ──────────            ──────────────
Match form fields    ──→  Rating Algorithm    ──→  matches          ──→  Live Preview
                          Score → Band Map                               Band Reveal
                                                                         Player Home
                                                                         Coach Squad

Coach 6 sliders      ──→  Average → Band     ──→  assessments      ──→  Player Profile
                                                                         Parent Home

Invite code entry    ──→  Code Validator      ──→  player_coach     ──→  Squad View
                                                   player_parent         Parent Home

Goal manual update   ──→  (direct write)      ──→  goals            ──→  Goals Screen
Match save           ──→  Auto-Goal Calc      ──→  goals                 Result Card
Match save           ──→  Medal Check         ──→  medals           ──→  Result Card
All interactions     ──→  Telemetry Logger    ──→  telemetry_events ──→  Pilot Dashboard
```

**Parent data filtering:** RLS grants parents SELECT on `matches` and
`assessments` for their child. The app-layer `ParentFilter` strips
private columns (`body_condition`, `self_rating`, `position_inputs`,
`assessment.note`) before rendering. This is defence-in-depth — RLS
handles row-level, app handles column-level.

---

## Project Structure

```
src/
├── main.tsx                          # Entry point
├── App.tsx                           # Router + auth provider
├── lib/
│   ├── supabase.ts                   # Supabase client init
│   ├── auth.tsx                      # Auth context + hooks
│   ├── rating.ts                     # computeScore, scoreToBand, BANDS config
│   ├── medals.ts                     # checkMedals (6 trigger functions)
│   ├── goals.ts                      # checkAutoGoals, updateGoalProgress
│   ├── telemetry.ts                  # trackEvent(type, metadata)
│   ├── invite-codes.ts              # generateCode, validateCode
│   └── types.ts                      # All TypeScript types (from PRD §17.2)
├── components/
│   ├── ui/                           # Shared design system components
│   │   ├── BandPill.tsx
│   │   ├── BandPreview.tsx
│   │   ├── Card.tsx
│   │   ├── NavBar.tsx
│   │   ├── PillSelector.tsx
│   │   ├── SliderInput.tsx
│   │   ├── MetadataLabel.tsx
│   │   ├── InviteCodeDisplay.tsx
│   │   ├── MatchCard.tsx
│   │   ├── GoalCard.tsx
│   │   ├── MedalSlot.tsx
│   │   ├── AlertCard.tsx
│   │   └── CategoryBar.tsx
│   └── layout/
│       ├── MobileShell.tsx           # Max 430px wrapper + safe area
│       └── RouteGuard.tsx            # Auth + role + onboarding check
├── pages/
│   ├── Landing.tsx                   # s-landing
│   ├── player/
│   │   ├── Onboarding.tsx            # s-ob-p1 → s-ob-p-done (multi-step)
│   │   ├── Home.tsx                  # s-p-home
│   │   ├── LogChoose.tsx             # s-p-logchoose
│   │   ├── LogForm.tsx               # s-p-logform
│   │   ├── Result.tsx                # s-p-result
│   │   ├── Matches.tsx               # s-p-matches
│   │   ├── MatchDetail.tsx           # s-p-matchdetail
│   │   ├── Goals.tsx                 # s-p-goals
│   │   ├── AddGoal.tsx               # s-p-addgoal
│   │   ├── UpdateGoal.tsx            # s-p-updategoal
│   │   ├── Medals.tsx                # s-p-medals
│   │   └── Profile.tsx               # s-p-profile
│   ├── coach/
│   │   ├── Onboarding.tsx            # s-ob-c1 → s-ob-c-done
│   │   ├── Home.tsx                  # s-c-home
│   │   ├── Squad.tsx                 # s-c-squad
│   │   ├── AddPlayer.tsx             # s-c-addplayer
│   │   ├── PlayerProfile.tsx         # s-c-playerprofile
│   │   ├── Sessions.tsx              # s-c-sessions
│   │   ├── AddSession.tsx            # s-c-addsession
│   │   ├── Assess.tsx                # s-c-assess
│   │   ├── InviteCode.tsx            # s-c-invitecode
│   │   └── Profile.tsx               # s-c-profile
│   └── parent/
│       ├── Onboarding.tsx            # s-ob-par1 → s-ob-par-done
│       ├── Home.tsx                  # s-par-home
│       ├── Matches.tsx               # s-par-matches
│       ├── Goals.tsx                 # s-par-goals
│       └── Alerts.tsx                # s-par-alerts
├── hooks/
│   ├── useMatches.ts                 # CRUD + queries for matches
│   ├── useAssessments.ts             # CRUD + queries for assessments
│   ├── useGoals.ts                   # CRUD + auto-track logic
│   ├── useMedals.ts                  # Read + check triggers
│   ├── useSquad.ts                   # Coach squad queries
│   ├── useProfile.ts                 # Profile CRUD
│   └── useAlerts.ts                  # Parent alert queries
└── styles/
    └── globals.css                   # CSS variables, font imports, band classes
```

---

## API Contracts

Trak uses the Supabase JS client, which maps directly to PostgREST. No
custom API endpoints. All contracts are expressed as Supabase client
calls with their RLS context.

### Match Log (REQ-001)

**Insert match:**
```typescript
// Client-side: after computeScore
const { data, error } = await supabase
  .from('matches')
  .insert({
    player_id,           // from player context
    opponent,            // string
    score_us,            // int
    score_them,          // int
    competition,         // 'league'|'cup'|'tournament'|'friendly'
    venue,               // 'home'|'away'
    age_group,           // string
    minutes_played,      // int
    card,                // 'none'|'yellow'|'red'
    body_condition,      // 'fresh'|'good'|'tired'|'knock'
    self_rating,         // 'poor'|'average'|'good'|'excellent'
    position,            // 'gk'|'def'|'mid'|'att'
    position_inputs,     // JSONB — position-specific answers
    computed_score,      // decimal(4,2) — from computeScore()
    band,                // string — from scoreToBand()
    is_friendly,         // boolean — derived from competition === 'friendly'
  })
  .select()
  .single();
```

**Errors:**
- 403: RLS violation — player_id doesn't match auth.uid()'s player
- 400: Check constraint violation (invalid enum value)

### Fetch player matches (Player Home, Match History):
```typescript
const { data } = await supabase
  .from('matches')
  .select('*')
  .eq('player_id', playerId)
  .order('logged_at', { ascending: false });
```

### Fetch child matches (Parent — filtered):
```typescript
const { data } = await supabase
  .from('matches')
  .select('id, opponent, score_us, score_them, competition, venue, age_group, minutes_played, band, logged_at')
  // Explicitly excludes: body_condition, self_rating, position_inputs, computed_score
  .eq('player_id', childPlayerId)
  .order('logged_at', { ascending: false });
```

### Coach Assessment (REQ-002)

**Insert assessment:**
```typescript
const { data, error } = await supabase
  .from('assessments')
  .insert({
    coach_id,
    player_id,
    match_id,            // optional
    appearance,          // 'started'|'sub'|'training'
    work_rate,           // 1–10
    tactical,            // 1–10
    attitude,            // 1–10
    technical,           // 1–10
    physical,            // 1–10
    coachability,        // 1–10
    overall_band,        // computed: scoreToBand(average)
    self_rating_flag,    // 'fair'|'generous'|'way off' or null
    note,                // optional text
  })
  .select()
  .single();
```

### Invite Code Validation (REQ-003)

**Validate coach code:**
```typescript
const { data } = await supabase
  .from('coaches')
  .select('id, profile_id, club, age_group')
  .eq('invite_code', code.toUpperCase())
  .single();
// data === null → invalid code
// data exists → show coach info, create connection
```

**Create connection:**
```typescript
const { error } = await supabase
  .from('player_coach')
  .insert({ player_id, coach_id: data.id });
// 409/23505: unique constraint → already connected
```

**Validate parent code:**
```typescript
const { data } = await supabase
  .from('players')
  .select('id, profile_id, profiles(first_name, last_name)')
  .eq('parent_invite_code', code.toUpperCase())
  .single();
// Show child name for confirmation before parent creates account
```

### Telemetry (REQ-005)

**Track event:**
```typescript
const { error } = await supabase
  .from('telemetry_events')
  .insert({
    user_id: (await supabase.auth.getUser()).data.user.id,
    event_type,    // 'form_start'|'form_submit'|'match_log'|'assessment'|'parent_open'
    metadata,      // JSONB
  });
```

---

## Edge Cases

### Auth & Routing
1. **User signs up but never confirms email** → Auth session exists but
   email_confirmed_at is null. RouteGuard checks this and shows
   "Check your email" screen. Do not allow access to any app screen.

2. **User clears cookies mid-onboarding** → Session lost. On return,
   Supabase refresh token is gone. Redirect to login. Onboarding
   progress is stored in the `players`/`coaches`/`parents` table — if a
   partial row exists, resume from the incomplete step.

3. **User selects wrong role on landing** → No role change mechanism in
   pilot. If a user signed up as "coach" but meant "player," they must
   contact the founder. Document this in pilot onboarding instructions.
   Do not build a role-switcher.

### Invite Codes
4. **Player enters invalid coach code** → Show inline error: "Code not
   found. Check with your coach." Do not reveal whether the code format
   is wrong vs. doesn't exist (avoid enumeration).

5. **Player enters same coach code twice** → `player_coach` has a
   composite primary key. Supabase returns a 409/23505 error. Catch and
   show: "You're already connected to this coach."

6. **Parent enters PAR-XXXX code but player hasn't generated one yet**
   → `parent_invite_code` is null for that player. Code lookup returns
   no match. Show: "Code not found."

7. **Two parents try to use the same PAR-XXXX code** → Allow it. The
   `player_parent` table supports multiple parents per player (both
   parents should be able to see their child). No unique constraint on
   parent_id alone — only on (player_id, parent_id).

8. **Coach regenerates invite code while players have the old one** →
   Old code no longer valid. Already-connected players remain connected
   (connection is in `player_coach`, not tied to the code value). New
   players must use the new code.

### Match Logging
9. **Player submits match with all-zero scores (0-0 draw)** → Valid.
   Result modifier is 0 (draw). Proceed normally.

10. **Player enters 120 minutes played** → Valid (extra time). Modifier
    is +0.1 (full match). Clamp at 120 in the UI number input.

11. **Player logs a match while offline** → Not handled in pilot. If
    the Supabase insert fails due to network, show an error toast:
    "Couldn't save. Check your connection and try again." Do not queue
    offline. Form state is preserved so they can retry.

12. **Computed score exceeds 10.0 or goes below 4.0** → Clamped by the
    algorithm. This is tested in the rating engine unit tests.

13. **Friendly match: modifiers produce a very high score** → The 0.8
    multiplier applies to the *delta from baseline*, not the final
    score. E.g., if modifiers total +2.0, friendly makes it +1.6,
    final = 8.1 (Good), not 8.5 (Standout). This distinction matters
    and must be implemented correctly.

### Coach Assessment
14. **Coach assesses a player they're not connected to** → RLS blocks
    the INSERT. App should not render unconnected players in the player
    selector. Belt-and-suspenders.

15. **Coach submits all 1s or all 10s** → Valid. Band maps to Difficult
    or Exceptional respectively. No artificial floor/ceiling beyond the
    band mapping.

16. **Coach links assessment to a match that belongs to a different
    player** → The app should only show matches for the selected player
    in the match-link dropdown. RLS on matches ensures the coach can
    only see connected players' matches. If somehow a mismatch occurs,
    the assessment is still valid — match_id is informational, not
    structural.

### Goals & Medals
17. **Auto-tracked goal reaches target mid-match-save** → Mark as
    `completed = true`, set `current_number = target_number`. Show
    completion card on result screen.

18. **"On a Roll" medal — player logs two matches in one week, none the
    next** → The medal requires matches in 5 *consecutive calendar
    weeks* (Mon–Sun). Logging 2 in week 1 counts as week 1 covered,
    but week 2 is still required. The check queries `DISTINCT
    date_trunc('week', logged_at)` and looks for 5 consecutive values.

19. **"Self Aware" medal — no coach assessment exists for a match** →
    The self-rating-to-coach-band comparison only fires when both exist.
    If a player has 10 matches but only 3 have coach assessments, only
    those 3 can count toward the 5 needed.

20. **"Most Improved" medal — player has fewer than 10 matches** →
    Cannot trigger. The sliding window requires exactly 10 matches.
    Medal check short-circuits if `COUNT(matches) < 10`.

### Parent
21. **Parent opens app but child has zero matches** → Show empty state:
    "No matches yet. When [Child] logs a match, you'll see it here."
    Do not show broken charts or NaN values.

22. **Parent tries to POST/PATCH/DELETE via devtools** → RLS rejects.
    No INSERT/UPDATE/DELETE policies exist for parent role on any table.
    Return 403.

### Telemetry
23. **Telemetry insert fails (e.g., network)** → Swallow the error
    silently. Telemetry must never block the user's flow. Wrap all
    telemetry calls in try/catch with no user-visible error.

24. **Clock skew between client and server** → `telemetry_events
    .created_at` uses `DEFAULT now()` (server time). Do not use
    client-side timestamps for telemetry.

---

## Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Algorithm execution | Client-side (React) | 30-user pilot, zero tamper risk, one codebase, live preview reuses same function |
| 2 | Medal/goal automation | Client-side after match save | No DB triggers to debug; atomic enough for pilot scale |
| 3 | State management | React Context (auth/role) + custom hooks with Supabase client | Simplest viable; no external state library needed for pilot scope |
| 4 | Parent column filtering | App-layer SELECT (explicit column list) | RLS handles row-level; app-layer handles column-level; no DB views needed |
| 5 | Real-time updates | None (pilot) | 30 users, no concurrent editing, polling on page load is sufficient |
| 6 | Invite code format | `TRK-XXXX` / `PAR-XXXX` (4 alphanumeric chars after prefix) | Human-readable, verbal-friendly, collision-safe at pilot scale |
| 7 | Code generation | `crypto.randomUUID().slice(0,4).toUpperCase()` | Simple, sufficient entropy for <100 codes |
| 8 | Onboarding state | Derived from table existence (profile exists? player exists? coach_invite_code set?) | No separate onboarding_step column; fewer moving parts |
| 9 | Routing | React Router v6 with role-based layout routes | Standard, well-documented, no SSR needed |
| 10 | Telemetry failure handling | Silent swallow (try/catch, no UI error) | Telemetry must never degrade UX |
| 11 | Font loading | Self-hosted woff2 in `public/fonts` (DM Sans + DM Mono) | Google Fonts CDN leaked player IPs to a third party; revised for the pilot's privacy review |
| 12 | Session persistence | Supabase refresh tokens (localStorage) | Default Supabase behaviour, no custom session management |
| 13 | Deployment | Vercel (auto-deploys from `main`) | Moved off Lovable hosting 2026-09-04; Lovable is retained only for the AI gateway key |
| 14 | Testing framework | Vitest + React Testing Library | Vite-native, fast, TypeScript-first |
| 15 | Position modifiers | All 4 positions fully specced (GK: 5 questions, DEF: 6, MID: 6, ATT: 6) | Full algorithm doc provided by founder; no stubs needed |

---

## Open Gaps (Non-Blocking for Architecture Lock)

1. ~~GK, DEF, MID position-specific modifier tables~~ **CLOSED.** All
   four positions (GK, DEF, MID, ATT) now have fully specced modifier
   tables with questions and scoring. See PRD Sections 6.3–6.6.

2. ~~Pilot club name~~ **CLOSED.** Pilot club: **PilotClub.**

3. **"Most Improved" medal algorithm** — The trigger is "band
   distribution improves over any 10-match window." The precise
   definition of "improves" needs clarification: does it mean (a) the
   average band is higher, (b) the proportion of Standout+ bands
   increases, or (c) the latest band is higher than the earliest?
   **Recommendation:** use (a) average computed_score over matches
   11–20 > average over matches 1–10. Flag for founder confirmation.

---

## Hardening Plan (Post-Pilot, If Q4 Metric Hit)

If the pilot validates (≥60% weekly logging for 8 weeks), harden before
scaling to club #2:

1. Move rating algorithm to Supabase Edge Function (TypeScript, shared
   code with client preview)
2. Move medal/goal checks to DB triggers or Edge Function
3. Add optimistic locking for concurrent assessment writes
4. Add proper offline queue with IndexedDB for match logging
5. Add Supabase Realtime subscriptions for coach → player notifications
6. Add rate limiting on invite code validation (prevent brute force at
   scale)

These are explicitly out of scope for the pilot build.

---

## Diagram Files

All diagrams are in Graphviz DOT format:

| Diagram | File |
|---------|------|
| Component diagram | `docs/pm/refs/diagrams/component.dot` |
| Match log sequence | `docs/pm/refs/diagrams/sequence-match-log.dot` |
| Data flow | `docs/pm/refs/diagrams/data-flow.dot` |

Render with: `dot -Tpng filename.dot -o filename.png`

---

*Architecture locked pending founder approval of component diagram +
data flow. Once approved, run `/gsd-plan` to create the execution plan.*
