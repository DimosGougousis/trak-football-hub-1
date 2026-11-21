-- TRAK-518 (Imad, 20 and 21 Nov): a match evaluation's answers start empty, and Publish waits until the coach has
-- answered for each player who played. Until now every player started at "Did the job · Met" (20261029100000), so a
-- coach could publish without looking at anyone.
--
-- A draft keeps exactly what the coach answered: an answer not given is NULL, and saving no longer fills it with Yes or
-- Met. Publishing is refused while a player who played has no "Against expectation", or no "Did the job?" when the plan
-- gave them a job (TRAK-447: a player with no job is asked only the one). Evaluations already published don't change,
-- and rows saved before this keep their stored answers.

ALTER TABLE public.game_evaluation_players
  ALTER COLUMN did_job DROP NOT NULL, ALTER COLUMN did_job DROP DEFAULT,
  ALTER COLUMN against_expectation DROP NOT NULL, ALTER COLUMN against_expectation DROP DEFAULT,
  DROP CONSTRAINT game_evaluation_players_unplayed_listed_only,
  -- Someone who didn't play is only listed: no answers (rows from before this hold the old Yes · Met).
  ADD CONSTRAINT game_evaluation_players_unplayed_listed_only
    CHECK (played OR (did_job IS NULL AND against_expectation IS NULL) OR (did_job = 'yes' AND against_expectation = 'met'));

-- As 20261029100000, but an answer not given stays empty.
CREATE OR REPLACE FUNCTION public.save_game_evaluation(p_event_id uuid, p_our_score integer, p_their_score integer,
  p_goals jsonb, p_how_they_scored text, p_plan_worked text[], p_players jsonb)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e public.coach_calendar_events;
  v_published timestamptz;
BEGIN
  SELECT * INTO e FROM public.coach_calendar_events ev
  WHERE ev.id = p_event_id AND ev.coach_user_id = (SELECT auth.uid());
  IF NOT FOUND OR NOT public.is_coach() THEN
    RAISE EXCEPTION 'This match isn''t one of yours' USING ERRCODE = '42501';
  END IF;
  IF NOT public.feature_on('games') THEN
    RAISE EXCEPTION 'Games is switched off for your academy' USING ERRCODE = '42501';
  END IF;
  IF e.event_type <> 'match' THEN
    RAISE EXCEPTION 'Only a match has an evaluation' USING ERRCODE = 'P0001';
  END IF;
  IF e.status = 'cancelled' THEN
    RAISE EXCEPTION 'This match was cancelled, so it has no evaluation' USING ERRCODE = 'P0001';
  END IF;
  -- Full time as lib/games/loop.ts works it out.
  IF COALESCE(e.ends_at, e.starts_at + interval '90 minutes') > now() THEN
    RAISE EXCEPTION 'The evaluation opens at full time' USING ERRCODE = 'P0001';
  END IF;

  -- One save at a time for a match, and none once it's published.
  INSERT INTO public.game_evaluations (event_id) VALUES (e.id) ON CONFLICT (event_id) DO NOTHING;
  SELECT g.published_at INTO v_published FROM public.game_evaluations g WHERE g.event_id = e.id FOR UPDATE;
  IF v_published IS NOT NULL THEN
    RAISE EXCEPTION 'This evaluation is published, so it can''t change' USING ERRCODE = 'P0001';
  END IF;

  p_players := COALESCE(p_players, '[]');
  -- 42501 like the match log's consent refusal, so the app can re-check consent and say why.
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_players) AS x(id uuid)
             WHERE x.id IS NULL OR NOT trak_private.game_plan_player_ok(e.id, x.id)) THEN
    RAISE EXCEPTION 'Nothing is recorded about a child until a parent approves, and only for this squad''s players'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_players) AS x(played boolean, note text)
             WHERE x.played IS NOT TRUE AND btrim(COALESCE(x.note, '')) <> '') THEN
    RAISE EXCEPTION 'Only a player who played gets a note' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.game_evaluation_players p WHERE p.event_id = e.id
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_players) AS x(id uuid) WHERE x.id = p.squad_player_id);
  INSERT INTO public.game_evaluation_players AS p (event_id, squad_player_id, played, did_job, against_expectation)
    SELECT e.id, x.id, x.played, x.did_job, x.against_expectation
    FROM jsonb_to_recordset(p_players) AS x(id uuid, played boolean, did_job text, against_expectation text)
  ON CONFLICT (event_id, squad_player_id) DO UPDATE
    SET played = EXCLUDED.played, did_job = EXCLUDED.did_job, against_expectation = EXCLUDED.against_expectation;
  DELETE FROM public.game_evaluation_notes n WHERE n.event_id = e.id;
  INSERT INTO public.game_evaluation_notes (event_id, squad_player_id, note)
    SELECT e.id, x.id, btrim(x.note) FROM jsonb_to_recordset(p_players) AS x(id uuid, note text)
    WHERE btrim(COALESCE(x.note, '')) <> '';

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_goals, '[]')) AS g,
               LATERAL (VALUES (g->>'scorer'), (g->>'assist')) AS who(id)
             WHERE who.id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM public.game_evaluation_players p
               WHERE p.event_id = e.id AND p.played AND p.squad_player_id::text = who.id)) THEN
    RAISE EXCEPTION 'Scorers and assists are players who played' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.game_evaluations g
  SET our_score = p_our_score, their_score = p_their_score, goals = COALESCE(p_goals, '[]'),
      how_they_scored = COALESCE(p_how_they_scored, ''), plan_worked = COALESCE(p_plan_worked, '{}'), saved_at = now()
  WHERE g.event_id = e.id;
  RETURN now();
END;
$$;

-- Publishing (publish_game_evaluation) marks the evaluation published before it copies anything, so this refuses it
-- there, whatever calls it, and the whole publish rolls back.
CREATE FUNCTION trak_private.evaluation_answered_before_publish()
RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.game_evaluation_players p
             LEFT JOIN public.game_plan_players gp ON gp.event_id = p.event_id AND gp.squad_player_id = p.squad_player_id
             WHERE p.event_id = NEW.event_id AND p.played
               AND (p.against_expectation IS NULL OR (p.did_job IS NULL AND btrim(COALESCE(gp.job, '')) <> ''))) THEN
    RAISE EXCEPTION 'Answer for every player who played before you publish' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trak_private.evaluation_answered_before_publish() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER game_evaluations_answered_before_publish
  BEFORE UPDATE OF published_at ON public.game_evaluations
  FOR EACH ROW WHEN (OLD.published_at IS NULL AND NEW.published_at IS NOT NULL)
  EXECUTE FUNCTION trak_private.evaluation_answered_before_publish();
