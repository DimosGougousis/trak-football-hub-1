-- TRAK-153 (J4): a match refused as a whole must leave nothing behind.
--
-- CoachAddSession saves the session and attendance before each player's
-- log_match_for_player(). So TRAK-149's two match-level refusals came after a
-- second session was already in, and coaches can't delete sessions:
--   "This match is already saved as 1-0; every player in it needs the same score"
--   "2 goals entered, but the team scored 1" (goals counted across saves)
-- The app couldn't check first: coaches can't read public.matches (only the
-- player and their parents can).
--
-- This answers exactly the questions those refusals answer, for the calling
-- coach's own rows only: logged by them as a coach, on that date, against that
-- opponent (case and surrounding spaces ignored, the same key as
-- log_match_for_player). It returns the saved score and the goals already
-- saved when any row disagrees with the score about to be saved, or when
-- p_goals (this save's goals, for the players it will write) would take the
-- match past the team's score; no row otherwise. Scores and a goal count only:
-- no child, no player row. log_match_for_player() still refuses on its own;
-- this only lets the app refuse before it writes anything.
CREATE FUNCTION public.coach_match_score_clash(
  p_match_date     date,
  p_opponent       text,
  p_team_score     integer,
  p_opponent_score integer,
  p_goals          integer DEFAULT 0
)
RETURNS TABLE (team_score integer, opponent_score integer, saved_goals integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  -- No GROUP BY: one answer for the whole match, or none (bool_or and sum are
  -- null when nothing is saved yet). min() is the score the refusal reports.
  SELECT min(m.team_score), min(m.opponent_score), sum(m.goals)::integer
  FROM public.matches m
  WHERE m.logged_by = auth.uid()
    AND m.logged_by_role = 'coach'
    AND m.match_date = COALESCE(p_match_date, CURRENT_DATE)
    AND lower(btrim(coalesce(m.opponent, ''))) = lower(btrim(coalesce(p_opponent, '')))
  HAVING bool_or(m.team_score IS DISTINCT FROM p_team_score
                 OR m.opponent_score IS DISTINCT FROM p_opponent_score)
      -- Fewer is fine (own goals, a scorer not on the roster), as in the RPC.
      OR (p_team_score IS NOT NULL AND sum(m.goals) + COALESCE(p_goals, 0) > p_team_score);
$fn$;
REVOKE ALL ON FUNCTION public.coach_match_score_clash(date, text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_match_score_clash(date, text, integer, integer, integer) TO authenticated;
COMMENT ON FUNCTION public.coach_match_score_clash(date, text, integer, integer, integer) IS
  'TRAK-153 (J4). The score and goals this coach already saved for this match (date + opponent), when the score differs from the one about to be saved or p_goals would take it past the team score; no row otherwise. Lets CoachAddSession refuse before writing a session.';
