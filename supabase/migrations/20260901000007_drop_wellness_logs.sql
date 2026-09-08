-- Drop the dormant wellness table.
--
-- wellness_logs stored mood, energy, sleep quality and free-text notes per
-- child per day. Under GDPR that is plausibly special category data, which
-- would mean explicit consent and most likely a DPIA.
--
-- Nothing writes to it. Wellness check-ins were cut from the pilot scope and
-- WellnessCheck.tsx was reachable from no route, so the table carried the full
-- legal weight of children's health data while delivering nothing.
--
-- The same call was already made for player_goals (20260615000001) for the
-- same stated reason: children's data that would otherwise need declaring.
--
-- Verified empty before running: SELECT count(*) FROM wellness_logs; -> 0

DROP TABLE IF EXISTS public.wellness_logs;
