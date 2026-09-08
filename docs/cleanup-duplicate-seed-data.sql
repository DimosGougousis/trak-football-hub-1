-- ============================================================
-- Clean up duplicate rows created by earlier dev-seed runs
--
-- Before 42e43c3 the dev seed used plain INSERTs, so every run added
-- another copy of the same matches, assessments, notes, calendar events
-- and Player of the Week award. The parent alerts feed showed each match
-- twice, three days apart — one set per run.
--
-- The seed is now idempotent, so no NEW duplicates appear. This removes
-- the ones already in the database.
--
-- ⚠️ RUN STEP 1 FIRST AND READ THE OUTPUT. Only run step 2 if the counts
--    look like duplicates you actually want gone. Step 2 deletes rows.
--    These statements only touch the dev/test accounts' data, but there
--    is no undo — take a Supabase backup first if in any doubt.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- STEP 1 — INSPECT ONLY. Nothing is modified.
-- ─────────────────────────────────────────────────────────────

-- Duplicate matches: same player, opponent, score and minute count
SELECT 'matches' AS table_name, user_id, opponent, team_score, opponent_score,
       COUNT(*) AS copies, MIN(created_at) AS keeps, MAX(created_at) AS newest
FROM public.matches
GROUP BY user_id, opponent, team_score, opponent_score, minutes_played
HAVING COUNT(*) > 1
ORDER BY copies DESC;

-- Duplicate assessments: same squad player and identical six scores
SELECT 'coach_assessments' AS table_name, squad_player_id,
       work_rate, tactical, attitude, technical, physical, coachability,
       COUNT(*) AS copies
FROM public.coach_assessments
GROUP BY squad_player_id, work_rate, tactical, attitude, technical, physical, coachability
HAVING COUNT(*) > 1
ORDER BY copies DESC;

-- Duplicate awards
SELECT 'recognition_awards' AS table_name, squad_player_id, award_type, awarded_for,
       COUNT(*) AS copies
FROM public.recognition_awards
GROUP BY squad_player_id, award_type, awarded_for
HAVING COUNT(*) > 1;

-- Duplicate calendar events
SELECT 'coach_calendar_events' AS table_name, coach_user_id, title, event_type,
       COUNT(*) AS copies
FROM public.coach_calendar_events
GROUP BY coach_user_id, title, event_type
HAVING COUNT(*) > 1;


-- ─────────────────────────────────────────────────────────────
-- STEP 2 — DELETE. Keeps the OLDEST row of each duplicate group.
-- Uncomment and run only after reviewing step 1.
-- ─────────────────────────────────────────────────────────────

-- BEGIN;
--
-- -- matches
-- DELETE FROM public.matches m USING (
--   SELECT id, ROW_NUMBER() OVER (
--     PARTITION BY user_id, opponent, team_score, opponent_score, minutes_played
--     ORDER BY created_at
--   ) AS rn
--   FROM public.matches
-- ) d
-- WHERE m.id = d.id AND d.rn > 1;
--
-- -- assessment notes first (they reference assessments)
-- DELETE FROM public.coach_assessment_notes n
-- WHERE n.assessment_id IN (
--   SELECT id FROM (
--     SELECT id, ROW_NUMBER() OVER (
--       PARTITION BY squad_player_id, work_rate, tactical, attitude, technical, physical, coachability
--       ORDER BY created_at
--     ) AS rn
--     FROM public.coach_assessments
--   ) x WHERE x.rn > 1
-- );
--
-- -- assessments
-- DELETE FROM public.coach_assessments a USING (
--   SELECT id, ROW_NUMBER() OVER (
--     PARTITION BY squad_player_id, work_rate, tactical, attitude, technical, physical, coachability
--     ORDER BY created_at
--   ) AS rn
--   FROM public.coach_assessments
-- ) d
-- WHERE a.id = d.id AND d.rn > 1;
--
-- -- awards
-- DELETE FROM public.recognition_awards r USING (
--   SELECT id, ROW_NUMBER() OVER (
--     PARTITION BY squad_player_id, award_type, awarded_for
--     ORDER BY created_at
--   ) AS rn
--   FROM public.recognition_awards
-- ) d
-- WHERE r.id = d.id AND d.rn > 1;
--
-- -- calendar events
-- DELETE FROM public.coach_calendar_events e USING (
--   SELECT id, ROW_NUMBER() OVER (
--     PARTITION BY coach_user_id, title, event_type
--     ORDER BY starts_at
--   ) AS rn
--   FROM public.coach_calendar_events
-- ) d
-- WHERE e.id = d.id AND d.rn > 1;
--
-- -- Review the row counts reported above, then:
-- COMMIT;    -- or ROLLBACK; to abandon
