# Trak Football

Performance tracking app for youth football players, coaches, parents, and club admins.

## Prerequisites

- Node.js 20+
- npm 10+
- A [Supabase](https://supabase.com) project (free tier works)

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/kostasanastasioubusiness-lang/trak-football-hub.git
cd trak-football-hub

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in your Supabase URL and anon key

# 4. Apply database migrations
# Open your Supabase project → SQL Editor
# Run each file in supabase/migrations/ in chronological order

# 5. Start the dev server
npm run dev
```

The app runs at http://localhost:8080.

## Running Tests

```bash
npm test          # watch mode
npm test -- --run # single run (used in CI)
```

## Linting & Build

```bash
npm run lint      # ESLint — warnings are fine, errors block CI
npm run build     # Vite production build → dist/
```

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon (public) key |
| `VITE_SENTRY_DSN` | (Optional) Sentry DSN — only active in `PROD` |

See `.env.example` for the template.

## Project Structure

```
src/
  components/
    trak/           Shared design-system components (MobileShell, NavBar, BandPill, …)
    player/         Player-specific components (RatingTrendChart, CardRevealModal)
    club/           Club-specific components (ClubNavBar)
    icons/          TrakIcons SVG components
  contexts/
    AuthContext.tsx Auth state, sign-up / sign-in, profile creation
  lib/
    rating-engine.ts  computeMatchScore() — core rating algorithm
    types.ts          BANDS, BandType, UserRole
    telemetry.ts      trackEvent() helper
    squad-analytics.ts calculateSquadAnalytics()
  pages/
    player/         PlayerHome, PlayerMatches, PlayerEvolutionCard, PlayerPassport, …
    coach/          CoachHomePage, CoachSquadPage, CoachAssessPage, CoachAssistant, …
    parent/         ParentHome, ParentMatches, ParentAlerts
    club/           ClubHome, ClubSquads, ClubCoaches, ClubRadar
  integrations/
    supabase/       Generated Supabase client + types
supabase/
  migrations/       SQL migration files (apply in order)
  functions/        Edge Functions (coach-assistant, player-feedback)
```

## User Roles

| Role | Sign-up path | Key features |
|---|---|---|
| **Player** | Invite code from coach | Match history, evolution card, passport, coach feedback |
| **Coach** | Direct sign-up | Squad management, assessments, match logging, AI assistant |
| **Parent** | Link token from player | View child's matches, assessments, alerts |
| **Club admin** | Direct sign-up (club role) | Cross-squad overview, movement radar |

## Contributing

1. Create a feature branch off `main`
2. Run `npm test -- --run` and `npm run build` before pushing
3. CI (GitHub Actions) runs lint + test + build automatically on every push
