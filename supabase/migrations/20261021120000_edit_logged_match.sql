-- TRAK-185 part 1 (J4, 16 Oct live run): a logged match couldn't be corrected
-- after saving. A coach can now change its score and each player's goals,
-- assists and card, under the rules that applied when it was logged.
-- Decided (Imad, 18 Oct): any time, no notice to families; they see the
-- current score next time. Part 2 (a removed player kept as "Didn't play",
-- starter/sub) is separate: every stats reader would need to skip those rows.
--
-- Coaches have no read access to matches (families and players do, with
-- consent), so the edit screen reads the coach's own match through
-- logged_match(). Only matches linked to their session (every log since
-- 14 Oct, TRAK-138) can be edited; older rows stay as they are.

-- ── Reading a match the coach logged ─────────────────────────────────────
CREATE FUNCTION public.logged_match(p_session_id uuid)
RETURNS TABLE (
  user_id uuid, player_name text, "position" text, age_group text, competition text, venue text,
  opponent text, match_date date, minutes_played integer, goals integer, assists integer,
  card_received text, team_score integer, opponent_score integer,
  -- A child waiting for a parent's consent: shown by name, numbers withheld, not editable (G1).
  locked boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT m.user_id, sp.player_name, m.position, m.age_group, m.competition, m.venue,
         m.opponent, m.match_date, m.minutes_played,
         CASE WHEN sp.consent_required THEN NULL ELSE m.goals END,
         CASE WHEN sp.consent_required THEN NULL ELSE m.assists END,
         CASE WHEN sp.consent_required THEN NULL ELSE m.card_received END,
         m.team_score, m.opponent_score, sp.consent_required
  FROM public.matches m
  JOIN public.coach_sessions s ON s.id = m.session_id
  CROSS JOIN LATERAL (
    SELECT r.player_name, public.squad_player_consent_required(r.id) AS consent_required
    FROM public.squad_players r
    WHERE r.linked_player_id = m.user_id AND public.squad_player_is_mine(r.id)
    ORDER BY r.created_at
    LIMIT 1
  ) sp
  WHERE public.is_coach()
    AND m.session_id = p_session_id
    AND s.coach_user_id = auth.uid() AND s.session_type = 'match'
    AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach'
  ORDER BY sp.player_name;
$fn$;
REVOKE ALL ON FUNCTION public.logged_match(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logged_match(uuid) TO authenticated;
COMMENT ON FUNCTION public.logged_match(uuid) IS
  'TRAK-185: the coach''s own logged match, one row per player, for the edit screen. Numbers are withheld for a child waiting for consent.';

-- ── Correcting it ────────────────────────────────────────────────────────
-- p_players: one object per player in the match, every one of them:
--   {"user_id": uuid, "goals": int, "assists": int, "card": "None"|"Yellow"|"Red", "computed_rating": numeric}
-- The app recomputes each rating exactly as it does when logging.
CREATE FUNCTION public.edit_logged_match(p_session_id uuid, p_team_score integer, p_opponent_score integer, p_players jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_opponent text;
  v_day date;
  v_rows integer;
  v_goals integer := 0;
  v_assists integer := 0;
  v_item jsonb;
  v_player uuid;
  v_n integer;
  v_rating numeric;
  v_updated integer;
BEGIN
  IF NOT public.is_coach() THEN
    RAISE EXCEPTION 'Not authorised: only a coach can edit a match' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coach_sessions s
                 WHERE s.id = p_session_id AND s.coach_user_id = auth.uid() AND s.session_type = 'match') THEN
    RAISE EXCEPTION 'This is not a match you logged' USING ERRCODE = '42501';
  END IF;
  IF p_team_score IS NULL OR p_opponent_score IS NULL
     OR p_team_score NOT BETWEEN 0 AND 99 OR p_opponent_score NOT BETWEEN 0 AND 99 THEN
    RAISE EXCEPTION 'A score is a whole number from 0 to 99';
  END IF;
  IF jsonb_typeof(p_players) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'The players must be a list';
  END IF;

  SELECT lower(btrim(coalesce(m.opponent, ''))), m.match_date INTO v_opponent, v_day
  FROM public.matches m
  WHERE m.session_id = p_session_id AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No players are logged in this match';
  END IF;
  -- The same lock as log_match_for_player, so a log and an edit of one match take turns.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || '|' || v_day::text || '|' || v_opponent, 149));

  -- Every player in the match, each once: a score must be the same on every row.
  SELECT count(*) INTO v_rows FROM public.matches m
  WHERE m.session_id = p_session_id AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach';
  IF jsonb_array_length(p_players) <> v_rows
     OR (SELECT count(DISTINCT x->>'user_id') FROM jsonb_array_elements(p_players) x) <> v_rows
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_players) x
                WHERE NOT EXISTS (SELECT 1 FROM public.matches m
                                  WHERE m.session_id = p_session_id AND m.logged_by = auth.uid()
                                    AND m.user_id::text = x->>'user_id')) THEN
    RAISE EXCEPTION 'An edit includes every player in this match, once each';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_player := (v_item->>'user_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.squad_players sp
                   WHERE sp.linked_player_id = v_player AND public.squad_player_is_mine(sp.id)) THEN
      RAISE EXCEPTION 'Not authorised: player % is not in your squad', v_player USING ERRCODE = '42501';
    END IF;
    -- G1: nothing about a child changes without a parent's consent.
    IF EXISTS (SELECT 1 FROM public.squad_players sp
               WHERE sp.linked_player_id = v_player AND public.squad_player_is_mine(sp.id)
                 AND public.squad_player_consent_required(sp.id)) THEN
      RAISE EXCEPTION 'Waiting for parent: player % can''t be edited until a parent approves', v_player USING ERRCODE = '42501';
    END IF;
    FOREACH v_n IN ARRAY ARRAY[(v_item->>'goals')::integer, (v_item->>'assists')::integer] LOOP
      IF v_n IS NULL OR v_n NOT BETWEEN 0 AND 20 THEN
        RAISE EXCEPTION 'Goals and assists are whole numbers from 0 to 20';
      END IF;
    END LOOP;
    IF (v_item->>'goals')::integer > p_team_score THEN
      RAISE EXCEPTION 'A player cannot score more than the team''s %', p_team_score;
    END IF;
    IF coalesce(v_item->>'card', '') NOT IN ('None', 'Yellow', 'Red') THEN
      RAISE EXCEPTION 'A card is None, Yellow or Red';
    END IF;
    v_rating := (v_item->>'computed_rating')::numeric;
    IF v_rating IS NULL OR v_rating NOT BETWEEN 0 AND 10 THEN
      RAISE EXCEPTION 'A match rating is from 0 to 10';
    END IF;
    v_goals := v_goals + (v_item->>'goals')::integer;
    v_assists := v_assists + (v_item->>'assists')::integer;
  END LOOP;

  -- TRAK-149 / TRAK-167: the match adds up. Fewer is fine (own goals, unlisted scorers).
  IF v_goals > p_team_score THEN
    RAISE EXCEPTION '% goals entered, but the team scored %', v_goals, p_team_score;
  END IF;
  IF v_assists > p_team_score THEN
    RAISE EXCEPTION '% assist% entered, but the team scored %', v_assists,
      CASE WHEN v_assists = 1 THEN '' ELSE 's' END, p_team_score;
  END IF;

  UPDATE public.matches m
  SET team_score = p_team_score,
      opponent_score = p_opponent_score,
      goals = (x->>'goals')::integer,
      assists = (x->>'assists')::integer,
      card_received = x->>'card',
      computed_rating = (x->>'computed_rating')::numeric
  FROM jsonb_array_elements(p_players) x
  WHERE m.session_id = p_session_id AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach'
    AND m.user_id::text = x->>'user_id';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$fn$;
REVOKE ALL ON FUNCTION public.edit_logged_match(uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_logged_match(uuid, integer, integer, jsonb) TO authenticated;
COMMENT ON FUNCTION public.edit_logged_match(uuid, integer, integer, jsonb) IS
  'TRAK-185: correct a logged match''s score and each player''s goals, assists and card, every player at once, under the logging rules. No notice to families.';
