-- ============================================================
-- Drop player_goals
--
-- Goals were removed from the product by design: there is no route, no nav
-- entry and no way to reach them. The application code went in 7c1593b
-- (PlayerGoals.tsx, lib/goals.ts, and the dev-seed block), leaving only the
-- table and its RLS policies behind.
--
-- Nothing reads or writes it. The rows remaining are dev-seed leftovers
-- (duplicated by the pre-idempotent seed), not real user data.
--
-- Removed rather than left dormant because it is children's data: an unused
-- table still has to be declared when documenting what Trak stores, and still
-- has to be reasoned about in any security review.
--
-- Irreversible. If goal-setting ever returns it will be designed around the
-- character feature rather than resurrected from this schema.
-- ============================================================

DROP TABLE IF EXISTS public.player_goals CASCADE;
