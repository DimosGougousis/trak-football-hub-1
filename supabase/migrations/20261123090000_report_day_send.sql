-- TRAK-531 (Reports 8/10, Imad 21 Nov): report day. The coach sends the squad's reports with one Send, or one player's
-- on its own first; and the note goes to the player and his parents, in both copies of the report.
--
-- Sending one player keeps the report day open: season_evaluations.closed_at stays empty until the squad's Send, which
-- sends the rest and closes it. Only a closed day counts as the last report day; a row starts closed, so every day
-- published before this, and publish_evaluation() called on its own, close as they did. A player already sent is
-- refused, so nobody gets a report twice.
--
-- The note to the player and parents comes as `report_note` (up to 600 characters) and lives with the report, in
-- report_for_player and report_for_family. The old `note` still goes to coach_shared_feedback, which no parent reads
-- (20260926120000), and into the player's copy only, as before: a page still open from before this change says "Only
-- {name} sees it", so what it sends must never reach a parent.
--
-- shortcut: the family's season plan read (season_plan_player_reads) counts an open day as the last one, so while a
-- coach has sent only some players, the others' "next report" moves on early; fix it there if the gap lasts in use.

ALTER TABLE public.season_evaluations ADD COLUMN closed_at timestamptz DEFAULT now();
UPDATE public.season_evaluations SET closed_at = published_at;
COMMENT ON COLUMN public.season_evaluations.closed_at IS
  'TRAK-531: when the squad''s Send closed this report day. Empty while only some players have been sent their report.';

ALTER TABLE public.report_for_family ADD COLUMN note text NOT NULL DEFAULT '';
ALTER TABLE public.report_for_player ADD CONSTRAINT report_for_player_note_length CHECK (char_length(note) <= 600);
ALTER TABLE public.report_for_family ADD CONSTRAINT report_for_family_note_length CHECK (char_length(note) <= 600);

-- ── Publish: as 20261107200000, on the report day still open ───────────────
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
  'TRAK-364, TRAK-531: sends a report day: one assessment (no session) and its optional message per consented player, in the day still open if some players were sent already, and closes it. Checks the coach, the squad, the season_plan switch, consent and the date; all or nothing.';

-- ── Send: the wrapper the page calls ────────────────────────────────────────
-- As 20261122170000, plus each player's `report_note` in both copies, and `p_close`: false sends these players and keeps
-- the day open for the rest (send one player). A new argument, so the old one goes; a call without it closes, as before.
DROP FUNCTION public.publish_evaluation_with_objectives(uuid, date, jsonb, jsonb);
CREATE FUNCTION public.publish_evaluation_with_objectives(p_plan_id uuid, p_due_on date, p_players jsonb, p_objectives jsonb,
  p_close boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_list jsonb := coalesce(p_objectives, '[]'::jsonb);
 v_result jsonb;
 v_evaluation uuid;
 v_player uuid;
 v_entry jsonb;
 v_progress jsonb;
 v_row jsonb;
 v_open uuid[];
 v_seen uuid[];
 v_oid uuid;
 v_status text;
 v_title text;
 v_slot smallint;
 v_position text;
BEGIN
 IF jsonb_typeof(v_list) <> 'array' THEN
  RAISE EXCEPTION 'Objectives come as a list' USING ERRCODE = '22023';
 END IF;
 IF jsonb_typeof(p_players) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_players) e
     WHERE jsonb_typeof(e) = 'object' AND e ? 'report_note'
       AND (jsonb_typeof(e -> 'report_note') NOT IN ('string', 'null') OR char_length(btrim(coalesce(e ->> 'report_note', ''))) > 600)) THEN
  RAISE EXCEPTION 'A note is up to 600 characters' USING ERRCODE = '22023';
 END IF;
 v_result := public.publish_evaluation(p_plan_id, p_due_on, p_players);
 v_evaluation := (v_result ->> 'evaluation_id')::uuid;

 -- Only for players in this evaluation, each once.
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) e
     WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'squad_player_id') IS DISTINCT FROM 'string'
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_players) p WHERE p ->> 'squad_player_id' = e ->> 'squad_player_id'))
   OR (SELECT count(DISTINCT e ->> 'squad_player_id') FROM jsonb_array_elements(v_list) e) <> jsonb_array_length(v_list) THEN
  RAISE EXCEPTION 'Objectives are for players in this evaluation, each once' USING ERRCODE = '22023';
 END IF;

 FOR v_player IN SELECT (p ->> 'squad_player_id')::uuid FROM jsonb_array_elements(p_players) p LOOP
  SELECT e INTO v_entry FROM jsonb_array_elements(v_list) e WHERE e ->> 'squad_player_id' = v_player::text;
  v_progress := coalesce(v_entry -> 'progress', '[]'::jsonb);
  IF jsonb_typeof(v_progress) <> 'array' OR jsonb_typeof(coalesce(v_entry -> 'add', '[]'::jsonb)) <> 'array' THEN
   RAISE EXCEPTION 'Progress and added objectives come as lists' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(po.id), '{}') INTO v_open FROM public.player_objectives po
   WHERE po.squad_player_id = v_player AND po.status = 'open';
  v_seen := '{}';
  FOR v_row IN SELECT e FROM jsonb_array_elements(v_progress) e LOOP
   IF jsonb_typeof(v_row) <> 'object' OR jsonb_typeof(v_row -> 'player_objective_id') IS DISTINCT FROM 'string'
     OR coalesce(v_row ->> 'status', '') NOT IN ('not_yet', 'some_progress', 'on_track', 'met') THEN
    RAISE EXCEPTION 'Each objective gets Not yet, Some progress, On track or Met' USING ERRCODE = '22023';
   END IF;
   v_oid := (v_row ->> 'player_objective_id')::uuid;
   IF NOT v_oid = ANY (v_open) OR v_oid = ANY (v_seen) THEN
    RAISE EXCEPTION 'Progress is for a player''s open objectives, each once' USING ERRCODE = '22023';
   END IF;
   v_seen := v_seen || v_oid;
   v_status := v_row ->> 'status';
   INSERT INTO public.objective_progress (evaluation_id, player_objective_id, status) VALUES (v_evaluation, v_oid, v_status);
   IF v_status = 'met' THEN
    UPDATE public.player_objectives SET status = 'met', retired_at = now() WHERE id = v_oid;
   END IF;
  END LOOP;
  IF cardinality(v_open) <> cardinality(v_seen) THEN
   RAISE EXCEPTION 'Say how each of a player''s objectives is going' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_entry -> 'add', '[]'::jsonb)) a WHERE jsonb_typeof(a) <> 'string') THEN
   RAISE EXCEPTION 'An objective is one line of 1 to 120 characters' USING ERRCODE = '22023';
  END IF;
  FOR v_title IN SELECT e FROM jsonb_array_elements_text(coalesce(v_entry -> 'add', '[]'::jsonb)) e LOOP
   IF v_title <> btrim(v_title) OR char_length(v_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'An objective is one line of 1 to 120 characters' USING ERRCODE = '22023';
   END IF;
   SELECT sp.position INTO v_position FROM public.squad_players sp WHERE sp.id = v_player;
   IF v_position IS NULL OR v_position NOT IN ('Goalkeeper', 'Defender', 'Midfielder', 'Attacker') THEN
    RAISE EXCEPTION 'Give them a position first' USING ERRCODE = '22023';
   END IF;
   IF EXISTS (SELECT 1 FROM public.player_objectives po
       WHERE po.squad_player_id = v_player AND po.status = 'open' AND lower(po.title) = lower(v_title)) THEN
    RAISE EXCEPTION 'They are already working on that objective' USING ERRCODE = '22023';
   END IF;
   SELECT s INTO v_slot FROM unnest(ARRAY[1, 2]::smallint[]) s
    WHERE NOT EXISTS (SELECT 1 FROM public.player_objectives po
      WHERE po.squad_player_id = v_player AND po.status = 'open' AND po.slot = s)
    ORDER BY s LIMIT 1;
   IF v_slot IS NULL THEN
    RAISE EXCEPTION 'A player works on up to two objectives at once' USING ERRCODE = '22023';
   END IF;
   INSERT INTO public.player_objectives (squad_player_id, slot, title, source, created_by)
    VALUES (v_player, v_slot, v_title, 'own', auth.uid());
  END LOOP;
 END LOOP;
 -- TRAK-528: each player's report as sent, once the objectives' answers are in.
 PERFORM trak_private.send_reports(v_evaluation);
 -- TRAK-531: these players' reports go now, whenever the day was first sent, with the note in both copies.
 UPDATE public.report_for_player r SET sent_at = now(),
   note = CASE WHEN btrim(coalesce(p ->> 'report_note', '')) <> '' THEN btrim(p ->> 'report_note') ELSE r.note END
  FROM jsonb_array_elements(p_players) p
  WHERE r.evaluation_id = v_evaluation AND r.squad_player_id = (p ->> 'squad_player_id')::uuid;
 UPDATE public.report_for_family r SET sent_at = now(), note = btrim(coalesce(p ->> 'report_note', ''))
  FROM jsonb_array_elements(p_players) p
  WHERE r.evaluation_id = v_evaluation AND r.squad_player_id = (p ->> 'squad_player_id')::uuid;
 IF p_close IS FALSE THEN
  UPDATE public.season_evaluations SET closed_at = NULL WHERE id = v_evaluation;
 END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.publish_evaluation_with_objectives(uuid, date, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_evaluation_with_objectives(uuid, date, jsonb, jsonb, boolean) TO authenticated;
COMMENT ON FUNCTION public.publish_evaluation_with_objectives(uuid, date, jsonb, jsonb, boolean) IS
  'TRAK-365, TRAK-528, TRAK-531: publish_evaluation() plus each open objective''s progress, Met, and added objectives, then each player''s report as sent, with the note to the player and parents in both copies; p_close false keeps the report day open for the rest. All or nothing.';
