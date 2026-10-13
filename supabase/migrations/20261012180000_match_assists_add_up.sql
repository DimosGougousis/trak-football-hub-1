-- TRAK-167 (J4): a match's assists must add up too.
-- J8 live run 2 (12 Oct, S11): a 1-0 saved with 5 assists for one player.
-- TRAK-149 held the match's goals to the team's score, and nothing did the
-- same for assists. Each goal has at most one assist, so the assists saved for
-- one match (this coach, date, opponent: TRAK-149's key) can't pass the team's
-- score. Fewer is fine: a goal with no assist, or one set up by a player who
-- isn't on the roster. An unknown score is not a violation.
--
-- log_match_for_player(): same function, signature and grants (CREATE OR
-- REPLACE); the body is 20261009190000's with assists added to the match
-- total, under the same lock.
-- coach_match_score_clash() (TRAK-153): gains p_assists (default 0, so the
-- app's current call still works while the new one deploys) and returns the
-- saved assists. A new argument and column can't be added in place, so it is
-- dropped and made again with the same grants.

CREATE OR REPLACE FUNCTION public.log_match_for_player(
  p_user_id         uuid,
  p_opponent        text,
  p_team_score      integer,
  p_opponent_score  integer,
  p_competition     text,
  p_venue           text,
  p_position        text,
  p_age_group       text,
  p_minutes_played  integer,
  p_goals           integer,
  p_assists         integer,
  p_card_received   text,
  p_body_condition  text,
  p_self_rating     text,
  p_computed_rating numeric,
  p_match_date      date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed integer;
  match_opponent text := lower(btrim(coalesce(p_opponent, '')));
  match_day date := COALESCE(p_match_date, CURRENT_DATE);
  match_goals integer;
  match_assists integer;
  match_team integer;
  match_opponent_score integer;
  score_differs boolean;
BEGIN
  -- The row records logged_by_role = 'coach'. Check it rather than assert it.
  IF NOT public.is_coach() THEN
    RAISE EXCEPTION 'Not authorised: caller is not a coach';
  END IF;

  -- Caller must currently hold this player: their roster row, not departed,
  -- and in the academy the caller is in now. squad_player_is_mine() is the
  -- single definition of that, shared with every coach write policy.
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_players sp
    WHERE sp.linked_player_id = p_user_id
      AND public.squad_player_is_mine(sp.id)
  ) THEN
    RAISE EXCEPTION 'Not authorised: caller is not the coach of player %', p_user_id;
  END IF;

  -- G1: nothing is recorded about a child until a parent has approved.
  -- 42501, like the RLS refusals, so the app can re-check consent and say why.
  IF EXISTS (
    SELECT 1 FROM public.squad_players sp
    WHERE sp.linked_player_id = p_user_id
      AND public.squad_player_is_mine(sp.id)
      AND public.squad_player_consent_required(sp.id)
  ) THEN
    RAISE EXCEPTION 'Waiting for parent: nothing is recorded about player % until a parent approves', p_user_id
      USING ERRCODE = '42501';
  END IF;

  -- ── What the coach claims must be possible ────────────────
  IF p_minutes_played IS NULL OR p_minutes_played < 0 OR p_minutes_played > 120 THEN
    RAISE EXCEPTION 'Minutes played must be between 0 and 120, got %', p_minutes_played;
  END IF;

  IF p_goals IS NULL OR p_goals < 0 OR p_goals > 20 THEN
    RAISE EXCEPTION 'Goals must be between 0 and 20, got %', p_goals;
  END IF;

  IF p_assists IS NULL OR p_assists < 0 OR p_assists > 20 THEN
    RAISE EXCEPTION 'Assists must be between 0 and 20, got %', p_assists;
  END IF;

  IF p_minutes_played = 0 AND (p_goals > 0 OR p_assists > 0) THEN
    RAISE EXCEPTION 'A player with no minutes cannot have goals or assists';
  END IF;

  IF p_team_score IS NOT NULL AND p_goals > p_team_score THEN
    RAISE EXCEPTION 'A player cannot score more than the team''s %', p_team_score;
  END IF;

  allowed := greatest(3, p_minutes_played / 5);
  IF p_minutes_played > 0 AND p_goals + p_assists > allowed THEN
    RAISE EXCEPTION '% goals and assists in % minutes is not possible (max %)',
      p_goals + p_assists, p_minutes_played, allowed;
  END IF;

  -- ── TRAK-149: the match's rows must add up ─────────────────
  -- One row per player, and no match row, so this coach's rows on this date
  -- against this opponent (case and spaces ignored) are one match. The lock
  -- makes two players saved at the same moment take turns, so both can't pass
  -- the total. Reads below run after it and see the other's committed row.
  -- ponytail: two games against one opponent on one day count as one match;
  -- J8.15's event id can replace this key.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || '|' || match_day::text || '|' || match_opponent, 149));

  SELECT coalesce(sum(m.goals), 0), coalesce(sum(m.assists), 0), min(m.team_score), min(m.opponent_score),
         bool_or(m.team_score IS DISTINCT FROM p_team_score
                 OR m.opponent_score IS DISTINCT FROM p_opponent_score)
    INTO match_goals, match_assists, match_team, match_opponent_score, score_differs
  FROM public.matches m
  WHERE m.logged_by = auth.uid()
    AND m.logged_by_role = 'coach'
    AND m.match_date = match_day
    AND lower(btrim(coalesce(m.opponent, ''))) = match_opponent;

  IF score_differs THEN
    RAISE EXCEPTION 'This match is already saved as %-%; every player in it needs the same score',
      match_team, match_opponent_score;
  END IF;

  -- Fewer is fine: own goals, or a scorer who isn't on the roster.
  IF p_team_score IS NOT NULL AND match_goals + p_goals > p_team_score THEN
    RAISE EXCEPTION '% goals entered, but the team scored %', match_goals + p_goals, p_team_score;
  END IF;

  -- TRAK-167: each goal has at most one assist. Fewer is fine.
  IF p_team_score IS NOT NULL AND match_assists + p_assists > p_team_score THEN
    RAISE EXCEPTION '% assist% entered, but the team scored %', match_assists + p_assists,
      CASE WHEN match_assists + p_assists = 1 THEN '' ELSE 's' END, p_team_score;
  END IF;

  INSERT INTO public.matches (
    user_id, opponent, team_score, opponent_score, competition, venue,
    position, age_group, minutes_played, goals, assists, card_received,
    body_condition, self_rating, computed_rating,
    match_date, logged_by, logged_by_role
  ) VALUES (
    p_user_id, p_opponent, p_team_score, p_opponent_score, p_competition, p_venue,
    p_position, p_age_group, p_minutes_played, p_goals, p_assists, p_card_received,
    p_body_condition, p_self_rating, p_computed_rating,
    COALESCE(p_match_date, CURRENT_DATE), auth.uid(), 'coach'
  );
END;
$$;

DROP FUNCTION public.coach_match_score_clash(date, text, integer, integer, integer);

-- TRAK-153 (J4), with TRAK-167's assists. The score, goals and assists this
-- coach already saved for this match (same key as log_match_for_player), when
-- any saved row disagrees with the score about to be saved, or when p_goals or
-- p_assists (this save's, for the players it will write) would take the match
-- past the team's score; no row otherwise. Scores and counts only: no child,
-- no player row. log_match_for_player() still refuses on its own; this only
-- lets the app refuse before it writes anything.
CREATE FUNCTION public.coach_match_score_clash(
  p_match_date     date,
  p_opponent       text,
  p_team_score     integer,
  p_opponent_score integer,
  p_goals          integer DEFAULT 0,
  p_assists        integer DEFAULT 0
)
RETURNS TABLE (team_score integer, opponent_score integer, saved_goals integer, saved_assists integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  -- No GROUP BY: one answer for the whole match, or none (bool_or and sum are
  -- null when nothing is saved yet). min() is the score the refusal reports.
  SELECT min(m.team_score), min(m.opponent_score), sum(m.goals)::integer, sum(m.assists)::integer
  FROM public.matches m
  WHERE m.logged_by = auth.uid()
    AND m.logged_by_role = 'coach'
    AND m.match_date = COALESCE(p_match_date, CURRENT_DATE)
    AND lower(btrim(coalesce(m.opponent, ''))) = lower(btrim(coalesce(p_opponent, '')))
  HAVING bool_or(m.team_score IS DISTINCT FROM p_team_score
                 OR m.opponent_score IS DISTINCT FROM p_opponent_score)
      -- Fewer is fine (own goals, a scorer not on the roster, a goal with no
      -- assist), as in the RPC.
      OR (p_team_score IS NOT NULL AND sum(m.goals) + COALESCE(p_goals, 0) > p_team_score)
      OR (p_team_score IS NOT NULL AND sum(m.assists) + COALESCE(p_assists, 0) > p_team_score);
$fn$;
REVOKE ALL ON FUNCTION public.coach_match_score_clash(date, text, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_match_score_clash(date, text, integer, integer, integer, integer) TO authenticated;
COMMENT ON FUNCTION public.coach_match_score_clash(date, text, integer, integer, integer, integer) IS
  'TRAK-153 / TRAK-167 (J4). The score, goals and assists this coach already saved for this match (date + opponent), when the score differs from the one about to be saved or p_goals / p_assists would take it past the team score; no row otherwise. Lets CoachAddSession refuse before writing a session.';
