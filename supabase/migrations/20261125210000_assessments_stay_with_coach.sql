-- TRAK-532 (Reports 9/10, Imad 21 Nov): assessments stay with the coach; families get reports.
--
-- Where the season plan is on and the player's squad has a shared plan:
-- * Assess player saves with published_at NULL (the app sends it), so the existing policy "Only the coach reads a
--   draft assessment" (20261018200000) keeps the bands from the player, the parents and other coaches.
-- * Save is final for the objective check-in (Kostas, 23 Nov): Met closes the objective and an added one starts at
--   once, as Publish did. apply_assessment_objectives() now runs for such an unpublished assessment too.
-- * Report day stores each player's bands the same way: publish_evaluation() inserts them with published_at NULL.
--   The report (report_for_player, report_for_family) already counts every assessment, published or not.
-- Assessments published before this stay as they are. A squad with no shared plan keeps Publish and Save draft.
-- Every function below is copied from its latest migration with only the TRAK-532 lines changed.

-- ── Where an assessment stays with the coach ────────────────────────────────
CREATE FUNCTION trak_private.assessment_stays_with_coach(p_squad_player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.feature_on('season_plan') AND EXISTS (
  SELECT 1 FROM public.squad_players sp JOIN public.season_plans pl
    ON pl.coach_user_id = sp.coach_user_id AND pl.squad = btrim(sp.age_group) AND pl.shared_at IS NOT NULL
  WHERE sp.id = p_squad_player_id)
$$;
REVOKE ALL ON FUNCTION trak_private.assessment_stays_with_coach(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION trak_private.assessment_stays_with_coach(uuid) TO authenticated;
COMMENT ON FUNCTION trak_private.assessment_stays_with_coach(uuid) IS
  'TRAK-532: true where the season plan is on and the player''s squad has a shared plan: an assessment there is the coach''s own.';

-- ── The check-in applies on Save where the assessment stays with the coach ──
CREATE OR REPLACE FUNCTION trak_private.apply_assessment_objectives(p_assessment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_a public.coach_assessments%ROWTYPE;
 v_slot smallint;
 v_new uuid;
 v_item record;
BEGIN
 SELECT * INTO v_a FROM public.coach_assessments ca WHERE ca.id = p_assessment_id;
 IF NOT FOUND OR auth.uid() IS NULL OR v_a.coach_user_id <> auth.uid() THEN
  RAISE EXCEPTION 'Not authorized for this assessment' USING ERRCODE = '42501';
 END IF;
 -- TRAK-532: a published assessment applies its check-in; so does one saved where it stays with the coach.
 IF v_a.published_at IS NULL AND NOT trak_private.assessment_stays_with_coach(v_a.squad_player_id) THEN
  RAISE EXCEPTION 'Not authorized for this assessment' USING ERRCODE = '42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NULL) THEN
  RETURN;
 END IF;
 UPDATE public.player_objectives po SET status = 'met', retired_at = now()
  FROM public.assessment_objectives ao
  WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NULL AND ao.status = 'met' AND po.id = ao.player_objective_id AND po.status = 'open';
 FOR v_item IN SELECT ao.id, ao.added_title FROM public.assessment_objectives ao
     WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NULL AND ao.added_title IS NOT NULL ORDER BY ao.added_title LOOP
  SELECT s INTO v_slot FROM unnest(ARRAY[1, 2]::smallint[]) s
   WHERE NOT EXISTS (SELECT 1 FROM public.player_objectives po
     WHERE po.squad_player_id = v_a.squad_player_id AND po.status = 'open' AND po.slot = s)
   ORDER BY s LIMIT 1;
  IF v_slot IS NULL THEN
   RAISE EXCEPTION 'A player works on up to two objectives at once' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.player_objectives (squad_player_id, slot, title, source, created_by)
   VALUES (v_a.squad_player_id, v_slot, v_item.added_title, 'own', auth.uid()) RETURNING id INTO v_new;
  UPDATE public.assessment_objectives SET player_objective_id = v_new WHERE id = v_item.id;
 END LOOP;
 UPDATE public.assessment_objectives SET applied_at = now() WHERE assessment_id = v_a.id AND applied_at IS NULL;
END $$;

-- As 20261122120000, applying on every save that gets this far (the squad's plan is shared).
CREATE OR REPLACE FUNCTION trak_private.save_assessment_objectives(p_assessment_id uuid, p_progress jsonb, p_add jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_a public.coach_assessments%ROWTYPE;
 v_player public.squad_players%ROWTYPE;
 v_add jsonb := coalesce(p_add, '[]'::jsonb);
 v_open uuid[];
 v_seen uuid[] := '{}';
 v_row jsonb;
 v_oid uuid;
 v_title text;
BEGIN
 SELECT * INTO v_a FROM public.coach_assessments ca WHERE ca.id = p_assessment_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR v_a.coach_user_id <> auth.uid() OR NOT public.is_coach()
   OR NOT public.squad_player_is_mine(v_a.squad_player_id) THEN
  RAISE EXCEPTION 'Not authorized for this assessment' USING ERRCODE = '42501';
 END IF;
 IF p_progress IS NULL AND p_add IS NULL THEN RETURN; END IF;
 IF v_a.evaluation_id IS NOT NULL THEN
  RAISE EXCEPTION 'A squad evaluation''s answers are its own' USING ERRCODE = '22023';
 END IF;
 IF EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NOT NULL) THEN
  RAISE EXCEPTION 'A saved assessment''s answers stay as they were' USING ERRCODE = 'P0001';
 END IF;
 IF trak_private.squad_player_consent_required(v_a.squad_player_id) THEN
  RAISE EXCEPTION 'Waiting for consent: nothing is recorded about this player yet' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO v_player FROM public.squad_players sp WHERE sp.id = v_a.squad_player_id;
 -- The step is asked only where the season plan is on and the player's squad has a shared plan.
 IF NOT public.feature_on('season_plan') OR NOT EXISTS (SELECT 1 FROM public.season_plans pl
     WHERE pl.coach_user_id = v_player.coach_user_id AND pl.squad = btrim(v_player.age_group) AND pl.shared_at IS NOT NULL) THEN
  IF jsonb_array_length(coalesce(p_progress, '[]'::jsonb)) > 0 OR jsonb_array_length(v_add) > 0 THEN
   RAISE EXCEPTION 'This squad has no shared season plan' USING ERRCODE = '22023';
  END IF;
  RETURN;
 END IF;
 IF jsonb_typeof(coalesce(p_progress, '[]'::jsonb)) <> 'array' OR jsonb_typeof(v_add) <> 'array' THEN
  RAISE EXCEPTION 'Progress and added objectives come as lists' USING ERRCODE = '22023';
 END IF;

 -- Every open objective once, as the squad evaluation asks.
 SELECT coalesce(array_agg(po.id), '{}') INTO v_open FROM public.player_objectives po
  WHERE po.squad_player_id = v_player.id AND po.status = 'open';
 DELETE FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id;
 FOR v_row IN SELECT e FROM jsonb_array_elements(coalesce(p_progress, '[]'::jsonb)) e LOOP
  IF jsonb_typeof(v_row) <> 'object' OR jsonb_typeof(v_row -> 'player_objective_id') IS DISTINCT FROM 'string'
    OR coalesce(v_row ->> 'status', '') NOT IN ('not_yet', 'some_progress', 'on_track', 'met') THEN
   RAISE EXCEPTION 'Each objective gets Not yet, Some progress, On track or Met' USING ERRCODE = '22023';
  END IF;
  v_oid := (v_row ->> 'player_objective_id')::uuid;
  IF NOT v_oid = ANY (v_open) OR v_oid = ANY (v_seen) THEN
   RAISE EXCEPTION 'Progress is for a player''s open objectives, each once' USING ERRCODE = '22023';
  END IF;
  v_seen := v_seen || v_oid;
  INSERT INTO public.assessment_objectives (assessment_id, player_objective_id, status) VALUES (v_a.id, v_oid, v_row ->> 'status');
 END LOOP;
 IF cardinality(v_open) <> cardinality(v_seen) THEN
  RAISE EXCEPTION 'Say how each of a player''s objectives is going' USING ERRCODE = '22023';
 END IF;

 IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_add) a WHERE jsonb_typeof(a) <> 'string') THEN
  RAISE EXCEPTION 'An objective is one line of 1 to 120 characters' USING ERRCODE = '22023';
 END IF;
 FOR v_title IN SELECT e FROM jsonb_array_elements_text(v_add) e LOOP
  IF v_title <> btrim(v_title) OR char_length(v_title) NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'An objective is one line of 1 to 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_player.position IS NULL OR v_player.position NOT IN ('Goalkeeper', 'Defender', 'Midfielder', 'Attacker') THEN
   RAISE EXCEPTION 'Give them a position first' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.player_objectives po
      WHERE po.squad_player_id = v_player.id AND po.status = 'open' AND lower(po.title) = lower(v_title))
    OR EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND lower(ao.added_title) = lower(v_title)) THEN
   RAISE EXCEPTION 'They are already working on that objective' USING ERRCODE = '22023';
  END IF;
  -- Room after this check-in's Met answers: up to two open at once.
  IF (SELECT count(*) FROM public.player_objectives po WHERE po.squad_player_id = v_player.id AND po.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.player_objective_id = po.id AND ao.status = 'met'))
     + (SELECT count(*) FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.added_title IS NOT NULL) >= 2 THEN
   RAISE EXCEPTION 'A player works on up to two objectives at once' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.assessment_objectives (assessment_id, added_title) VALUES (v_a.id, v_title);
 END LOOP;

 -- TRAK-532: past the check above the squad's plan is shared, so the assessment stays with the coach and Save is final:
 -- Met closes the objective and an added one starts now, published or not.
 PERFORM trak_private.apply_assessment_objectives(v_a.id);
END $$;

-- ── Report day: the bands stay with the coach ───────────────────────────────
-- As 20261123090000, with the assessment inserted unpublished.
CREATE OR REPLACE FUNCTION public.publish_evaluation(p_plan_id uuid, p_due_on date, p_players jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_plan public.season_plans%ROWTYPE;
 v_list jsonb := coalesce(p_players, '[]'::jsonb);
 v_today date;
 v_last date;
 v_open date;
 v_evaluation uuid;
 v_coach_name text;
 v_item jsonb;
 v_id uuid;
 v_age_group text;
 v_assessment uuid;
 v_note text;
 v_out jsonb := '[]'::jsonb;
BEGIN
 -- Locks the plan, so two publishes run one after the other.
 SELECT * INTO v_plan FROM public.season_plans p WHERE p.id = p_plan_id AND p.coach_user_id = (SELECT auth.uid()) FOR UPDATE;
 IF NOT FOUND OR NOT public.is_coach() OR NOT trak_private.coaches_squad(v_plan.squad) THEN
  RAISE EXCEPTION 'This season plan isn''t one of yours' USING ERRCODE = '42501';
 END IF;
 IF NOT public.feature_on('season_plan') THEN
  RAISE EXCEPTION 'The season plan is switched off for your academy' USING ERRCODE = '42501';
 END IF;
 IF v_plan.shared_at IS NULL OR v_plan.starts_on IS NULL OR v_plan.ends_on IS NULL THEN
  RAISE EXCEPTION 'Share the season plan first: the reports follow it' USING ERRCODE = 'P0001';
 END IF;
 v_today := (now() AT TIME ZONE trak_private.academy_time_zone(public.my_coach_organization_id()))::date;
 IF p_due_on IS NULL OR p_due_on > v_today THEN
  RAISE EXCEPTION 'These reports aren''t due yet' USING ERRCODE = 'P0001';
 END IF;
 IF p_due_on < v_plan.starts_on OR p_due_on > v_plan.ends_on THEN
  RAISE EXCEPTION 'That report day isn''t in this season' USING ERRCODE = 'P0001';
 END IF;
 SELECT max(e.due_on) INTO v_last FROM public.season_evaluations e WHERE e.plan_id = v_plan.id AND e.closed_at IS NOT NULL;
 IF v_last IS NOT NULL AND p_due_on <= v_last THEN
  RAISE EXCEPTION 'These reports are already sent' USING ERRCODE = 'P0001';
 END IF;
 -- A report day some players were already sent: the rest go in it, on its date.
 SELECT e.id, e.due_on INTO v_evaluation, v_open FROM public.season_evaluations e WHERE e.plan_id = v_plan.id AND e.closed_at IS NULL;
 IF v_open IS NOT NULL AND v_open <> p_due_on THEN
  RAISE EXCEPTION 'Send the rest of the reports due % first', to_char(v_open, 'FMDD Mon') USING ERRCODE = 'P0001';
 END IF;

 -- Two checks, not one OR: jsonb_array_length() refuses what isn't an array, and SQL picks its own order.
 IF jsonb_typeof(v_list) <> 'array' THEN
  RAISE EXCEPTION 'A report day sends at least one player' USING ERRCODE = '22023';
 END IF;
 -- Everyone already sent one by one: the squad's Send only closes the day.
 IF jsonb_array_length(v_list) = 0 AND v_evaluation IS NULL THEN
  RAISE EXCEPTION 'A report day sends at least one player' USING ERRCODE = '22023';
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) e
     WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'squad_player_id') IS DISTINCT FROM 'string'
       OR (e ? 'note' AND jsonb_typeof(e -> 'note') NOT IN ('string', 'null'))
       OR char_length(coalesce(e ->> 'note', '')) > 300
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['work_rate', 'tactical', 'attitude', 'technical', 'physical', 'coachability']) k
         WHERE CASE WHEN jsonb_typeof(e -> k) = 'number'
           THEN NOT ((e ->> k)::numeric BETWEEN 0 AND 10 AND (e ->> k)::numeric % 1 = 0) ELSE true END))
   OR (SELECT count(DISTINCT e ->> 'squad_player_id') FROM jsonb_array_elements(v_list) e) <> jsonb_array_length(v_list) THEN
  RAISE EXCEPTION 'Each player comes once, with six whole ratings from 0 to 10 and a note of up to 300 characters' USING ERRCODE = '22023';
 END IF;

 SELECT nullif(btrim(p.full_name), '') INTO v_coach_name FROM public.profiles p WHERE p.user_id = auth.uid();
 IF v_evaluation IS NULL THEN
  INSERT INTO public.season_evaluations (plan_id, due_on, published_by) VALUES (v_plan.id, p_due_on, auth.uid())
   RETURNING id INTO v_evaluation;
 ELSE
  UPDATE public.season_evaluations SET closed_at = now() WHERE id = v_evaluation;
 END IF;
 FOR v_item IN SELECT e FROM jsonb_array_elements(v_list) e LOOP
  v_id := (v_item ->> 'squad_player_id')::uuid;
  IF NOT public.squad_player_is_mine(v_id) THEN
   RAISE EXCEPTION 'Not authorized for this squad player' USING ERRCODE = '42501';
  END IF;
  SELECT btrim(coalesce(sp.age_group, '')) INTO v_age_group FROM public.squad_players sp WHERE sp.id = v_id;
  IF v_age_group IS DISTINCT FROM v_plan.squad THEN
   RAISE EXCEPTION 'A player in this report day is in another squad' USING ERRCODE = '22023';
  END IF;
  -- As the assessment's own rules: nothing is recorded about a child waiting for a parent.
  IF trak_private.squad_player_consent_required(v_id) THEN
   RAISE EXCEPTION 'Waiting for consent: nothing is recorded about this player yet' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.coach_assessments a WHERE a.evaluation_id = v_evaluation AND a.squad_player_id = v_id) THEN
   RAISE EXCEPTION 'This player''s report is already sent' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.coach_assessments (coach_user_id, coach_name_snapshot, squad_player_id, session_id, appearance,
    work_rate, tactical, attitude, technical, physical, coachability,
    consistency, impact, workrate, technique, spirit, published_at, evaluation_id)
  SELECT auth.uid(), v_coach_name, v_id, NULL, NULL,
    r.work_rate, r.tactical, r.attitude, r.technical, r.physical, r.coachability,
    r.attitude, r.technical, r.work_rate, round((r.technical + r.tactical) / 2.0)::integer, round((r.attitude + r.coachability) / 2.0)::integer,
    -- TRAK-532: the bands stay with the coach (published_at NULL, as a draft's); the family reads the report.
    NULL, v_evaluation
  FROM (SELECT (v_item ->> 'work_rate')::integer AS work_rate, (v_item ->> 'tactical')::integer AS tactical,
      (v_item ->> 'attitude')::integer AS attitude, (v_item ->> 'technical')::integer AS technical,
      (v_item ->> 'physical')::integer AS physical, (v_item ->> 'coachability')::integer AS coachability) r
  RETURNING id INTO v_assessment;
  v_note := btrim(coalesce(v_item ->> 'note', ''));
  IF v_note <> '' THEN
   INSERT INTO public.coach_shared_feedback (assessment_id, coach_user_id, body, published_at)
    VALUES (v_assessment, auth.uid(), v_note, now());
  END IF;
  v_out := v_out || jsonb_build_array(jsonb_build_object('squad_player_id', v_id, 'assessment_id', v_assessment));
 END LOOP;
 RETURN jsonb_build_object('evaluation_id', v_evaluation, 'due_on', p_due_on, 'assessments', v_out);
END $$;
COMMENT ON FUNCTION public.publish_evaluation(uuid, date, jsonb) IS
  'TRAK-364, TRAK-531, TRAK-532: sends a report day: one assessment (no session, kept with the coach) and its optional message per consented player, in the day still open if some players were sent already, and closes it. Checks the coach, the squad, the season_plan switch, consent and the date; all or nothing.';
