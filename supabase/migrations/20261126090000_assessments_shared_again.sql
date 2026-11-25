-- TRAK-585 (Imad, 25 Nov, with Makis): an assessment is written by the coach and shared with the player and their
-- parents; only the coach edits it. This reverses the core of TRAK-532 (20261125210000).
--
-- * Assess player's one Save publishes again where the squad's plan is shared: the app no longer sends published_at
--   NULL there, so save_assessment_with_objectives() publishes as it did before TRAK-532. Nothing here changes it.
-- * Report day stores each player's bands published again: publish_evaluation() below, copied from 20261125210000
--   with only the TRAK-585 lines changed (it is 20261123090000's again).
-- No read policy changes. A published assessment is read as every published one is: the player reads the bands and
-- the message, parents the bands only (TRAK-63), the private note stays the coach's. Assessments saved unpublished
-- under TRAK-532 stay as they are (no backfill): the card shows them as drafts, with Publish.
-- trak_private.assessment_stays_with_coach() keeps its name (apply_assessment_objectives() calls it): it says only
-- whether the squad's plan is shared, where Save applies the objective check-in at once.

-- ── Report day: the bands are published again ───────────────────────────────
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
    -- TRAK-585: published, as before TRAK-532: the player and parents read the bands as any published assessment's.
    now(), v_evaluation
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
  'TRAK-364, TRAK-531, TRAK-585: sends a report day: one published assessment (no session) and its optional message per consented player, in the day still open if some players were sent already, and closes it. Checks the coach, the squad, the season_plan switch, consent and the date; all or nothing.';

COMMENT ON FUNCTION trak_private.assessment_stays_with_coach(uuid) IS
  'TRAK-532, TRAK-585: true where the season plan is on and the player''s squad has a shared plan; there Save applies the objective check-in at once. The name is TRAK-532''s: since TRAK-585 the assessment is published, not kept with the coach.';
