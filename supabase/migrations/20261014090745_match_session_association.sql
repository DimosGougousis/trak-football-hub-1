-- TRAK-174 / J6: preserve the coach's explicit session on new match rows.
-- Old rows remain unlinked; no date/opponent guess or backfill is made.
-- Clients have no INSERT/UPDATE grant on matches; the existing RPC is the
-- only family-facing write path. Its consent, academy, score and assists
-- checks are retained. Optional final argument keeps old callers working.
ALTER TABLE public.matches ADD COLUMN session_id uuid
  REFERENCES public.coach_sessions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX matches_session_player_unique ON public.matches(session_id, user_id)
  WHERE session_id IS NOT NULL;
COMMENT ON COLUMN public.matches.session_id IS
  'Explicit coach session for this player match. Null on legacy or unlinked records.';

-- Drop the old signature to avoid an ambiguous PostgREST overload when the
-- optional argument is omitted. Replace it with one extended signature.
DROP FUNCTION public.log_match_for_player(uuid,text,integer,integer,text,text,text,text,integer,integer,integer,text,text,text,numeric,date);

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
  p_match_date      date DEFAULT CURRENT_DATE,
  p_session_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  -- A link is explicit, never inferred from an opponent or calendar date.
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.coach_sessions s
    JOIN public.session_attendance a ON a.session_id = s.id
    JOIN public.squad_players sp ON sp.id = a.squad_player_id
    WHERE s.id = p_session_id AND s.coach_user_id = auth.uid()
      AND s.session_type = 'match' AND s.session_date = match_day
      AND sp.linked_player_id = p_user_id AND public.squad_player_is_mine(sp.id)
      AND a.status IN ('present', 'late')
  ) THEN
    RAISE EXCEPTION 'This match session is not available for this player' USING ERRCODE = '42501';
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

  IF p_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches WHERE user_id = p_user_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'This player already has a match for this session';
  END IF;

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
    match_date, logged_by, logged_by_role, session_id
  ) VALUES (
    p_user_id, p_opponent, p_team_score, p_opponent_score, p_competition, p_venue,
    p_position, p_age_group, p_minutes_played, p_goals, p_assists, p_card_received,
    p_body_condition, p_self_rating, p_computed_rating,
    COALESCE(p_match_date, CURRENT_DATE), auth.uid(), 'coach', p_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_match_for_player(uuid,text,integer,integer,text,text,text,text,integer,integer,integer,text,text,text,numeric,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_match_for_player(uuid,text,integer,integer,text,text,text,text,integer,integer,integer,text,text,text,numeric,date,uuid) TO authenticated;
-- DROP FUNCTION above removed the comment; restore it with the session link noted.
COMMENT ON FUNCTION public.log_match_for_player(uuid,text,integer,integer,text,text,text,text,integer,integer,integer,text,text,text,numeric,date,uuid) IS
  'Coach-side match logging. Verifies the caller is a coach who currently holds '
  'the player (20260917000005), then refuses records that describe something '
  'that could not have happened (20260920150000). The CHECK constraints on '
  'public.matches are the barrier; these messages exist so a coach is told what '
  'is wrong rather than reading a constraint name. An optional p_session_id links '
  'the row to the caller''s own match session the player attended (20261014090745).';
