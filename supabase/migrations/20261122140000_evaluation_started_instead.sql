-- TRAK-519 (Imad, 20 and 21 Nov): when a starter didn't show, the coach unticks them and ticks the player who started
-- in their place. "Came on" stays for players who came off the bench. The draft records who started in whose place;
-- that player is evaluated like anyone who played (the job was the no-show's, and players read their own job, so it
-- isn't passed on), and their match record takes the no-show's line. The no-show gets nothing, as before. The line-up
-- shared with families before kick-off doesn't change.

ALTER TABLE public.game_evaluation_players
  ADD COLUMN started_for uuid,
  ADD CONSTRAINT game_evaluation_players_started_for_played CHECK (started_for IS NULL OR (played AND started_for <> squad_player_id));
CREATE UNIQUE INDEX game_evaluation_players_one_per_starter
  ON public.game_evaluation_players (event_id, started_for) WHERE started_for IS NOT NULL;

-- As 20261122130000, with who started in a starter's place.
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
  -- TRAK-519: who started in a starter's place: a player who played and wasn't a starter, for a starter of the plan
  -- listed as not playing, one each.
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_players) AS x(id uuid, played boolean, started_for uuid)
             WHERE x.started_for IS NOT NULL AND (
               x.played IS NOT TRUE OR x.started_for = x.id
               OR EXISTS (SELECT 1 FROM public.game_plan_players gp WHERE gp.event_id = e.id AND gp.squad_player_id = x.id AND gp.role = 'starter')
               OR NOT EXISTS (SELECT 1 FROM public.game_plan_players gp WHERE gp.event_id = e.id AND gp.squad_player_id = x.started_for AND gp.role = 'starter')
               OR NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_players) AS s(id uuid, played boolean) WHERE s.id = x.started_for AND s.played IS NOT TRUE)))
     OR (SELECT count(x.started_for) <> count(DISTINCT x.started_for) FROM jsonb_to_recordset(p_players) AS x(started_for uuid)) THEN
    RAISE EXCEPTION 'Only one player starts in place of a starter who didn''t play' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.game_evaluation_players p WHERE p.event_id = e.id
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_players) AS x(id uuid) WHERE x.id = p.squad_player_id);
  INSERT INTO public.game_evaluation_players AS p (event_id, squad_player_id, played, did_job, against_expectation, started_for)
    SELECT e.id, x.id, x.played, x.did_job, x.against_expectation, x.started_for
    FROM jsonb_to_recordset(p_players) AS x(id uuid, played boolean, did_job text, against_expectation text, started_for uuid)
  ON CONFLICT (event_id, squad_player_id) DO UPDATE
    SET played = EXCLUDED.played, did_job = EXCLUDED.did_job, against_expectation = EXCLUDED.against_expectation,
        started_for = EXCLUDED.started_for;
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

-- As 20261030200000, with that player logged at the starter's line.
CREATE OR REPLACE FUNCTION public.publish_game_evaluation(p_event_id uuid, p_competition text DEFAULT NULL, p_home_away text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e public.coach_calendar_events;
  g public.game_evaluations;
  v_competition text;
  v_home_away text;
  v_skipped uuid[];
  v_session uuid;
  v_coach text;
  v_reviews integer;
  v_logged integer := 0;
  r record;
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
  IF COALESCE(e.ends_at, e.starts_at + interval '90 minutes') > now() THEN
    RAISE EXCEPTION 'The evaluation opens at full time' USING ERRCODE = 'P0001';
  END IF;
  -- One publish at a time, and only once.
  SELECT * INTO g FROM public.game_evaluations ge WHERE ge.event_id = e.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save the evaluation before you publish it' USING ERRCODE = 'P0001';
  END IF;
  IF g.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'This evaluation is already published' USING ERRCODE = 'P0001';
  END IF;
  IF g.our_score IS NULL OR g.their_score IS NULL THEN
    RAISE EXCEPTION 'Enter the score before you publish' USING ERRCODE = 'P0001';
  END IF;
  -- Every "Did the plan work?" answer is in: one for each of the plan's goals.
  IF cardinality(g.plan_worked) < COALESCE((SELECT jsonb_array_length(p.goals) FROM public.game_plans p WHERE p.event_id = e.id), 0)
     OR array_position(g.plan_worked, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Answer "Did the plan work?" for every goal before you publish' USING ERRCODE = 'P0001';
  END IF;
  v_competition := COALESCE(e.competition, p_competition);
  IF v_competition IS NULL OR v_competition NOT IN ('league', 'tournament', 'friendly') THEN
    RAISE EXCEPTION 'Pick the competition: league, tournament or friendly' USING ERRCODE = 'P0001';
  END IF;
  v_home_away := COALESCE(e.home_away, p_home_away);
  IF v_home_away IS NULL OR v_home_away NOT IN ('home', 'away') THEN
    RAISE EXCEPTION 'Say whether it was home or away' USING ERRCODE = 'P0001';
  END IF;
  -- A match logged the old way already has its result.
  IF EXISTS (SELECT 1 FROM public.coach_sessions s WHERE s.event_id = e.id) THEN
    RAISE EXCEPTION 'This match was already logged, so publishing can''t write its result again' USING ERRCODE = 'P0001';
  END IF;
  -- Saved on the match, so the result and the event agree. Neither is a change families are emailed about.
  IF e.competition IS NULL OR e.home_away IS NULL THEN
    UPDATE public.coach_calendar_events ev SET competition = v_competition, home_away = v_home_away WHERE ev.id = e.id;
  END IF;

  UPDATE public.game_evaluations ge SET published_at = now() WHERE ge.event_id = e.id;
  v_coach := COALESCE((SELECT btrim(pr.full_name) FROM public.profiles pr WHERE pr.user_id = e.coach_user_id), '');
  -- Who played and can still be recorded gets a review and a result; anyone else is skipped.
  v_skipped := ARRAY(SELECT p.squad_player_id FROM public.game_evaluation_players p
                     WHERE p.event_id = e.id AND p.played AND NOT trak_private.game_plan_player_ok(e.id, p.squad_player_id));

  -- The result as the match log writes it (CoachAddSession): the match's session and who played present, then below a
  -- row for each child with an account. No minutes, no cards and no rating: the evaluation doesn't ask them.
  INSERT INTO public.coach_sessions (coach_user_id, title, session_type, session_date, squad, event_id, competition, venue, notes)
  VALUES (e.coach_user_id, e.title, 'match', trak_private.event_day(e), e.squad, e.id, initcap(v_competition), initcap(v_home_away),
          g.our_score || '-' || g.their_score)
  RETURNING id INTO v_session;
  INSERT INTO public.session_attendance (session_id, squad_player_id, status)
  SELECT v_session, p.squad_player_id, 'present' FROM public.game_evaluation_players p
  WHERE p.event_id = e.id AND p.played AND p.squad_player_id <> ALL (v_skipped);

  -- TRAK-319: the family's review has the score and what was asked, never the job, "did the job" or a note line.
  INSERT INTO public.game_review_for_family
    (event_id, squad_player_id, our_score, their_score, job, did_job, expectation, context, against_expectation, has_note, coach_name, session_id)
  SELECT e.id, p.squad_player_id, g.our_score, g.their_score, '', NULL, COALESCE(gp.expectation, 'usual'),
         COALESCE(gp.context, '{}'), p.against_expectation, false, v_coach, v_session
  FROM public.game_evaluation_players p
  LEFT JOIN public.game_plan_players gp ON gp.event_id = e.id AND gp.squad_player_id = p.squad_player_id
  WHERE p.event_id = e.id AND p.played AND p.squad_player_id <> ALL (v_skipped);
  GET DIAGNOSTICS v_reviews = ROW_COUNT;
  -- The child's own: their job, whether they did it, and the coach's note when there is one.
  INSERT INTO public.game_review_for_player (event_id, squad_player_id, note, job, did_job)
  SELECT e.id, p.squad_player_id, COALESCE(n.note, ''), COALESCE(gp.job, ''), p.did_job
  FROM public.game_evaluation_players p
  LEFT JOIN public.game_plan_players gp ON gp.event_id = e.id AND gp.squad_player_id = p.squad_player_id
  LEFT JOIN public.game_evaluation_notes n ON n.event_id = e.id AND n.squad_player_id = p.squad_player_id
  WHERE p.event_id = e.id AND p.played AND p.squad_player_id <> ALL (v_skipped);

  FOR r IN
    -- TRAK-314: a starter at the line they played; who came on, at their profile's position. TRAK-519: who started in a
    -- starter's place, at that starter's line.
    SELECT sp.linked_player_id AS user_id,
           COALESCE(CASE WHEN gp.role = 'starter' THEN trak_private.slot_line(gpl.formation, gp.slot)
                         WHEN gs.role = 'starter' THEN trak_private.slot_line(gpl.formation, gs.slot) END, sp.position, '') AS position,
           COALESCE(sp.age_group, e.squad, '') AS age_group,
           (SELECT count(*) FROM jsonb_array_elements(g.goals) x WHERE x->>'scorer' = p.squad_player_id::text)::integer AS goals,
           (SELECT count(*) FROM jsonb_array_elements(g.goals) x WHERE x->>'assist' = p.squad_player_id::text)::integer AS assists
    FROM public.game_evaluation_players p
    JOIN public.squad_players sp ON sp.id = p.squad_player_id
    LEFT JOIN public.game_plan_players gp ON gp.event_id = e.id AND gp.squad_player_id = p.squad_player_id
    LEFT JOIN public.game_plan_players gs ON gs.event_id = e.id AND gs.squad_player_id = p.started_for
    LEFT JOIN public.game_plans gpl ON gpl.event_id = e.id
    WHERE p.event_id = e.id AND p.played AND sp.linked_player_id IS NOT NULL AND p.squad_player_id <> ALL (v_skipped)
  LOOP
    PERFORM public.log_match_for_player(r.user_id, e.opponent, g.our_score, g.their_score, initcap(v_competition), initcap(v_home_away),
      r.position, r.age_group, NULL, r.goals, r.assists, NULL, NULL, NULL, NULL, trak_private.event_day(e), v_session);
    v_logged := v_logged + 1;
  END LOOP;

  RETURN jsonb_build_object('reviews', v_reviews, 'logged', v_logged, 'skipped', to_jsonb(v_skipped));
END;
$$;
