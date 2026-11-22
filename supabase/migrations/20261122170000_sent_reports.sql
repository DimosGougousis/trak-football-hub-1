-- TRAK-528 (Reports 5/10, Imad 21 Nov): a report that has been sent never changes. Publishing a report day stores each
-- player's report as coach_player_report() shows it (TRAK-527), in two copies, the way a match review is stored
-- (TRAK-286): a row rule can't hide a column, so each audience reads its own table.
--   report_for_player   the whole report and the note to the player. The child, and his coach.
--   report_for_family   the report without each match's job and "Did the job?", and no note. The child and his
--                       guardians (TRAK-319: parents see Below, Met or Above, never the job).
-- Families read them only with consent in place, as every coach record. Nothing shows them to families yet: that is
-- Reports 6/10. Only trak_private.send_reports() writes them, once per player and report day, so sending again
-- (Reports 8/10's per-player Send, a retried publish) stores nothing new. Deleting the child's account deletes his
-- squad row and these with it; export_my_account() gives him his own.
--
-- A report day's ratings and objective answers belong to that day even when the coach publishes them later
-- (publish_evaluation() takes any due day up to today), so the report reads them on the evaluation's day, not on the
-- day they were saved. The report days published before this are sent now, built today from what was saved then.

-- ── The report, without the coach's checks ──────────────────────────────────
CREATE FUNCTION trak_private.player_report(p_squad_player_id uuid, p_report_day date, p_last_report_day date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
 v_sp public.squad_players%ROWTYPE;
 v_zone text;
 v_season date;
 v_from date;
 v_out jsonb;
BEGIN
 SELECT * INTO v_sp FROM public.squad_players sp WHERE sp.id = p_squad_player_id;
 IF p_report_day IS NULL OR (p_last_report_day IS NOT NULL AND p_last_report_day >= p_report_day) THEN
  RAISE EXCEPTION 'A report day comes after the last one' USING ERRCODE = '22023';
 END IF;
 v_zone := trak_private.academy_time_zone(v_sp.organization_id);
 SELECT pl.starts_on INTO v_season FROM public.season_plans pl
  WHERE pl.coach_user_id = v_sp.coach_user_id AND pl.squad = btrim(v_sp.age_group);
 -- Without a plan's start, the season starts on 1 July, as everywhere else in the app (seasonWindow()).
 v_season := coalesce(v_season, make_date(extract(year FROM p_report_day)::int - CASE WHEN extract(month FROM p_report_day) >= 7 THEN 0 ELSE 1 END, 7, 1));
 v_from := coalesce(p_last_report_day + 1, v_season);
 v_season := least(v_season, v_from);

 WITH assessed AS (
  SELECT ca.id, coalesce(se.due_on, (ca.created_at AT TIME ZONE v_zone)::date) AS day, ca.created_at,
    ca.work_rate, ca.tactical, ca.attitude, ca.technical, ca.physical, ca.coachability
  FROM public.coach_assessments ca
  LEFT JOIN public.season_evaluations se ON se.id = ca.evaluation_id
  WHERE ca.squad_player_id = v_sp.id AND ca.coach_user_id = v_sp.coach_user_id
    AND ca.work_rate IS NOT NULL AND ca.tactical IS NOT NULL AND ca.attitude IS NOT NULL
    AND ca.technical IS NOT NULL AND ca.physical IS NOT NULL AND ca.coachability IS NOT NULL
 ), answers AS (
  SELECT op.player_objective_id AS objective_id, op.status, se.due_on AS day, se.published_at AS at
  FROM public.objective_progress op JOIN public.season_evaluations se ON se.id = op.evaluation_id
  UNION ALL
  SELECT ao.player_objective_id, ao.status, a.day, a.created_at
  FROM public.assessment_objectives ao JOIN assessed a ON a.id = ao.assessment_id
  WHERE ao.status IS NOT NULL
 ), objectives AS (
  SELECT po.id, po.title, po.slot, po.status, po.created_at
  FROM public.player_objectives po
  WHERE po.squad_player_id = v_sp.id
    AND (po.created_at AT TIME ZONE v_zone)::date <= p_report_day
    AND (po.status = 'open' OR (po.status = 'met' AND (po.retired_at AT TIME ZONE v_zone)::date >= v_from))
 ), trainings AS (
  SELECT s.id, EXISTS (SELECT 1 FROM public.session_attendance a
    WHERE a.session_id = s.id AND a.squad_player_id = v_sp.id AND a.status = 'present') AS here
  FROM public.coach_sessions s
  WHERE s.coach_user_id = v_sp.coach_user_id AND s.session_type = 'training'
    AND s.session_date BETWEEN v_from AND p_report_day
    AND (s.squad IS NULL OR s.squad = btrim(v_sp.age_group))
    AND v_sp.created_at < ((s.session_date + 1)::timestamp AT TIME ZONE 'UTC')
    AND EXISTS (SELECT 1 FROM public.session_attendance a WHERE a.session_id = s.id AND a.status = 'present')
 )
 SELECT jsonb_build_object(
  'squad_player_id', v_sp.id,
  'player_name', v_sp.player_name,
  'squad', btrim(v_sp.age_group),
  'season_starts_on', v_season,
  'period_from', v_from,
  'report_day', p_report_day,
  'last_report_day', p_last_report_day,
  'assessments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'day', a.day,
      'work_rate', a.work_rate, 'tactical', a.tactical, 'attitude', a.attitude,
      'technical', a.technical, 'physical', a.physical, 'coachability', a.coachability) ORDER BY a.day, a.created_at)
    FROM assessed a WHERE a.day BETWEEN v_season AND p_report_day), '[]'::jsonb),
  -- The latest from before the season: his bands until his first assessment of it.
  'before_season', (SELECT jsonb_build_object('id', a.id, 'day', a.day,
      'work_rate', a.work_rate, 'tactical', a.tactical, 'attitude', a.attitude,
      'technical', a.technical, 'physical', a.physical, 'coachability', a.coachability)
    FROM assessed a WHERE a.day < v_season ORDER BY a.day DESC, a.created_at DESC LIMIT 1),
  'matches', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', e.id, 'day', e.event_date,
      'opponent', e.opponent, 'home_away', e.home_away, 'our_score', ge.our_score, 'their_score', ge.their_score,
      'job', coalesce(gp.job, ''), 'played', gep.played,
      'did_job', CASE WHEN gep.played THEN gep.did_job END,
      'against_expectation', CASE WHEN gep.played THEN gep.against_expectation END) ORDER BY e.event_date, e.start_time)
    FROM public.game_evaluation_players gep
    JOIN public.game_evaluations ge ON ge.event_id = gep.event_id AND ge.published_at IS NOT NULL
    JOIN public.coach_calendar_events e ON e.id = gep.event_id AND e.coach_user_id = v_sp.coach_user_id
    LEFT JOIN public.game_plan_players gp ON gp.event_id = gep.event_id AND gp.squad_player_id = gep.squad_player_id
    WHERE gep.squad_player_id = v_sp.id AND e.event_date BETWEEN v_from AND p_report_day), '[]'::jsonb),
  'objectives', coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title,
      'at_last_report', CASE WHEN p_last_report_day IS NOT NULL THEN (SELECT x.status FROM answers x
        WHERE x.objective_id = o.id AND x.day <= p_last_report_day ORDER BY x.day DESC, x.at DESC LIMIT 1) END,
      'now', (SELECT x.status FROM answers x WHERE x.objective_id = o.id AND x.day <= p_report_day ORDER BY x.day DESC, x.at DESC LIMIT 1))
      ORDER BY o.status = 'met', o.slot, o.created_at)
    FROM objectives o), '[]'::jsonb),
  'trainings', jsonb_build_object('attended', (SELECT count(*) FILTER (WHERE t.here) FROM trainings t),
    'total', (SELECT count(*) FROM trainings t))
 ) INTO v_out;
 RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION trak_private.player_report(uuid, date, date) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION trak_private.player_report(uuid, date, date) IS
  'TRAK-527, TRAK-528: one player''s report for one report day, with no caller check: coach_player_report() checks the coach; send_reports() stores it.';

-- The coach's report: the same checks as before, then the report.
CREATE OR REPLACE FUNCTION public.coach_player_report(p_squad_player_id uuid, p_report_day date, p_last_report_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_coach() OR NOT public.squad_player_is_mine(p_squad_player_id) THEN
  RAISE EXCEPTION 'Not authorized for this player' USING ERRCODE = '42501';
 END IF;
 IF public.coach_squad_player_consent_required(p_squad_player_id) THEN
  RAISE EXCEPTION 'This player is waiting for consent' USING ERRCODE = '42501';
 END IF;
 RETURN trak_private.player_report(p_squad_player_id, p_report_day, p_last_report_day);
END $$;

-- ── The two copies ──────────────────────────────────────────────────────────
CREATE TABLE public.report_for_player (
  evaluation_id uuid NOT NULL REFERENCES public.season_evaluations(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  report jsonb NOT NULL,
  note text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evaluation_id, squad_player_id)
);
CREATE INDEX report_for_player_squad_player ON public.report_for_player (squad_player_id);
CREATE TABLE public.report_for_family (
  evaluation_id uuid NOT NULL REFERENCES public.season_evaluations(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  report jsonb NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evaluation_id, squad_player_id)
);
CREATE INDEX report_for_family_squad_player ON public.report_for_family (squad_player_id);
ALTER TABLE public.report_for_player ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_for_family ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.report_for_player, public.report_for_family FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.report_for_player, public.report_for_family TO authenticated;

-- The caller is the child of squad row `p_squad_player_id` or, when `p_guardian`, one of his guardians, and the child
-- needs no consent or has it.
CREATE FUNCTION trak_private.family_reads_report(p_squad_player_id uuid, p_guardian boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.squad_players sp
    WHERE sp.id = p_squad_player_id
      AND sp.linked_player_id IS NOT NULL
      AND NOT public.player_consent_required(sp.linked_player_id)
      AND (sp.linked_player_id = (SELECT auth.uid())
           OR (p_guardian AND EXISTS (SELECT 1 FROM public.player_parent_links l
                 WHERE l.player_user_id = sp.linked_player_id AND l.parent_user_id = (SELECT auth.uid()))))
  );
$$;
REVOKE ALL ON FUNCTION trak_private.family_reads_report(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.family_reads_report(uuid, boolean) TO authenticated, service_role;

CREATE POLICY "The coach reads his players' sent reports" ON public.report_for_player
  FOR SELECT TO authenticated
  USING (public.squad_player_is_mine(squad_player_id));
CREATE POLICY "A child reads his own sent reports" ON public.report_for_player
  FOR SELECT TO authenticated
  USING (trak_private.family_reads_report(squad_player_id, false));
CREATE POLICY "A child and his guardians read the parents' copy" ON public.report_for_family
  FOR SELECT TO authenticated
  USING (trak_private.family_reads_report(squad_player_id, true));

-- ── Sending ─────────────────────────────────────────────────────────────────
-- Stores the report of each player rated in evaluation `p_evaluation_id`, or of the one player `p_squad_player_id`, as
-- it reads now, dated when the evaluation was published. A player already sent keeps what he was sent. Returns how many
-- players it sent.
CREATE FUNCTION trak_private.send_reports(p_evaluation_id uuid, p_squad_player_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
 v_eval public.season_evaluations%ROWTYPE;
 v_last date;
 v_player uuid;
 v_report jsonb;
 v_sent integer := 0;
BEGIN
 SELECT * INTO v_eval FROM public.season_evaluations e WHERE e.id = p_evaluation_id;
 IF NOT FOUND THEN RETURN 0; END IF;
 SELECT max(e.due_on) INTO v_last FROM public.season_evaluations e WHERE e.plan_id = v_eval.plan_id AND e.due_on < v_eval.due_on;
 FOR v_player IN SELECT DISTINCT a.squad_player_id FROM public.coach_assessments a
   WHERE a.evaluation_id = p_evaluation_id AND a.squad_player_id IS NOT NULL
     AND (p_squad_player_id IS NULL OR a.squad_player_id = p_squad_player_id)
     AND NOT EXISTS (SELECT 1 FROM public.report_for_player r WHERE r.evaluation_id = p_evaluation_id AND r.squad_player_id = a.squad_player_id)
 LOOP
  v_report := trak_private.player_report(v_player, v_eval.due_on, v_last);
  INSERT INTO public.report_for_player (evaluation_id, squad_player_id, report, note, sent_at)
  VALUES (p_evaluation_id, v_player, v_report,
    coalesce((SELECT f.body FROM public.coach_assessments a JOIN public.coach_shared_feedback f ON f.assessment_id = a.id
      WHERE a.evaluation_id = p_evaluation_id AND a.squad_player_id = v_player ORDER BY f.published_at DESC LIMIT 1), ''),
    coalesce(v_eval.published_at, now()));
  INSERT INTO public.report_for_family (evaluation_id, squad_player_id, report, sent_at)
  VALUES (p_evaluation_id, v_player,
    jsonb_set(v_report, '{matches}', coalesce((SELECT jsonb_agg(m - 'job' - 'did_job' ORDER BY i)
      FROM jsonb_array_elements(v_report -> 'matches') WITH ORDINALITY AS x(m, i)), '[]'::jsonb)),
    coalesce(v_eval.published_at, now()));
  v_sent := v_sent + 1;
 END LOOP;
 RETURN v_sent;
END $$;
REVOKE ALL ON FUNCTION trak_private.send_reports(uuid, uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION trak_private.send_reports(uuid, uuid) IS
  'TRAK-528: stores the sent reports of a report day (its players, or one), once each: the player''s copy and the parents''.';

-- Publish sends each player's report last, in the same transaction: a refused publish sends nothing.
CREATE OR REPLACE FUNCTION public.publish_evaluation_with_objectives(p_plan_id uuid, p_due_on date, p_players jsonb, p_objectives jsonb)
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
 RETURN v_result;
END $$;
COMMENT ON FUNCTION public.publish_evaluation_with_objectives(uuid, date, jsonb, jsonb) IS
  'TRAK-365, TRAK-528: publish_evaluation() plus each open objective''s progress, Met, and added objectives, then each player''s report as sent; all or nothing.';

-- ── Download my data ────────────────────────────────────────────────────────
-- export_my_account() as in 20261023090000, plus the child's sent reports with the observations about him.
CREATE OR REPLACE FUNCTION public.export_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_role  text;
  v_obs   boolean := public.export_scope_includes_observations();
  v_out   jsonb;
  v_sq    uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role::text INTO v_role FROM public.profiles WHERE user_id = v_uid;

  -- Header. A subject reading this needs to know what it covers and what it
  -- does not, in the document itself — not in a support email they never got.
  v_out := jsonb_build_object(
    'exported_at',   now(),
    'account',       jsonb_build_object('user_id', v_uid, 'role', v_role),
    'scope', jsonb_build_object(
      'includes_observations_about_you', v_obs,
      'note', CASE WHEN v_obs
        THEN 'Includes assessments and awards recorded about you by a coach, as well as data you provided.'
        ELSE 'Includes only data you provided. Assessments recorded about you by a coach are available on request.'
      END,
      'never_included', 'Private coaching notes, and any record belonging to another person.'
    )
  );

  -- ── Everyone: the account itself ───────────────────────────
  v_out := v_out || jsonb_build_object(
    'profile', (
      SELECT to_jsonb(p) - 'user_id'
      FROM public.profiles p WHERE p.user_id = v_uid
    ),
    'telemetry_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) - 'user_id' ORDER BY t.created_at)
      FROM public.telemetry_events t WHERE t.user_id = v_uid
    ), '[]'::jsonb)
  );

  -- ── Player ─────────────────────────────────────────────────
  IF v_role = 'player' THEN
    -- Roster rows that are THIS player's link. Used to reach assessments; a
    -- coach's other children are never in this set.
    SELECT COALESCE(array_agg(sp.id), '{}') INTO v_sq
    FROM public.squad_players sp WHERE sp.linked_player_id = v_uid;

    v_out := v_out || jsonb_build_object(
      'player_details', (
        SELECT to_jsonb(d) - 'user_id' FROM public.player_details d WHERE d.user_id = v_uid
      ),
      -- Provided by the subject: they logged these.
      'matches', COALESCE((
        SELECT jsonb_agg(to_jsonb(m) - 'user_id' ORDER BY m.match_date)
        FROM public.matches m WHERE m.user_id = v_uid
      ), '[]'::jsonb),
      -- TRAK-185: matches the coach marked "Didn't play", kept with their original record.
      'match_non_appearances', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('match_date', k.match_date, 'opponent', k.opponent,
                 'marked_at', k.marked_at, 'recorded', k.recorded - 'user_id') ORDER BY k.match_date)
        FROM public.match_non_appearances k WHERE k.user_id = v_uid
      ), '[]'::jsonb),
      'parent_links', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('parent_user_id', l.parent_user_id, 'created_at', l.created_at))
        FROM public.player_parent_links l WHERE l.player_user_id = v_uid
      ), '[]'::jsonb),
      'parental_consents', COALESCE((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.granted_at)
        FROM public.parental_consents c WHERE c.player_user_id = v_uid
      ), '[]'::jsonb),
      -- TRAK-177: the young person's own choices (granted, withdrawn, notice version, when).
      'own_consents', COALESCE((
        SELECT jsonb_agg(to_jsonb(o) - 'player_user_id' ORDER BY o.seq)
        FROM public.player_own_consents o WHERE o.player_user_id = v_uid
      ), '[]'::jsonb)
    );

    -- Observations ABOUT the player. Gated on the scope switch above.
    -- coach_assessment_notes is absent by design and stays absent whatever
    -- the switch says: K9 made it coach-private and portability does not
    -- reopen it.
    IF v_obs THEN
      v_out := v_out || jsonb_build_object(
        'coach_assessments', COALESCE((
          SELECT jsonb_agg(to_jsonb(a) - 'coach_user_id' ORDER BY a.created_at)
          FROM public.coach_assessments a WHERE a.squad_player_id = ANY(v_sq)
        ), '[]'::jsonb),
        'recognition_awards', COALESCE((
          SELECT jsonb_agg(to_jsonb(r) - 'coach_user_id' ORDER BY r.created_at)
          FROM public.recognition_awards r WHERE r.squad_player_id = ANY(v_sq)
        ), '[]'::jsonb),
        -- TRAK-528: the reports he was sent, his own copy with the note, oldest first.
        'reports', COALESCE((
          SELECT jsonb_agg(to_jsonb(rp) - 'squad_player_id' ORDER BY rp.report ->> 'report_day')
          FROM public.report_for_player rp WHERE rp.squad_player_id = ANY(v_sq)
        ), '[]'::jsonb)
      );
    END IF;
  END IF;

  -- ── Coach ──────────────────────────────────────────────────
  -- A coach's own work product. The children's own records (their match logs,
  -- their parent links) are theirs, not the coach's, and are not here.
  IF v_role = 'coach' THEN
    v_out := v_out || jsonb_build_object(
      'coach_details', (
        SELECT to_jsonb(d) - 'user_id' FROM public.coach_details d WHERE d.user_id = v_uid
      ),
      'squad_players', COALESCE((
        SELECT jsonb_agg(to_jsonb(sp) - 'coach_user_id' ORDER BY sp.created_at)
        FROM public.squad_players sp WHERE sp.coach_user_id = v_uid
          AND public.squad_player_is_mine(sp.id)
      ), '[]'::jsonb),
      'coach_assessments', COALESCE((
        SELECT jsonb_agg(to_jsonb(a) - 'coach_user_id' ORDER BY a.created_at)
        FROM public.coach_assessments a WHERE a.coach_user_id = v_uid
          AND public.squad_player_is_mine(a.squad_player_id)
      ), '[]'::jsonb),
      'coach_assessment_notes', COALESCE((
        SELECT jsonb_agg(to_jsonb(n) - 'coach_user_id' ORDER BY n.created_at)
        FROM public.coach_assessment_notes n WHERE n.coach_user_id = v_uid
          AND EXISTS (SELECT 1 FROM public.coach_assessments a
            WHERE a.id = n.assessment_id
              AND a.coach_user_id = v_uid
              AND public.squad_player_is_mine(a.squad_player_id))
      ), '[]'::jsonb),
      'coach_sessions', COALESCE((
        SELECT jsonb_agg(to_jsonb(s) - 'coach_user_id' ORDER BY s.created_at)
        FROM public.coach_sessions s WHERE s.coach_user_id = v_uid
      ), '[]'::jsonb),
      'coach_calendar_events', COALESCE((
        SELECT jsonb_agg(to_jsonb(e) - 'coach_user_id' ORDER BY e.starts_at)
        FROM public.coach_calendar_events e WHERE e.coach_user_id = v_uid
      ), '[]'::jsonb),
      'recognition_awards', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) - 'coach_user_id' ORDER BY r.created_at)
        FROM public.recognition_awards r WHERE r.coach_user_id = v_uid
          AND public.squad_player_is_mine(r.squad_player_id)
      ), '[]'::jsonb),
      'staff_compliance', COALESCE((
        SELECT jsonb_agg(to_jsonb(sc) - 'coach_user_id')
        FROM public.staff_compliance sc WHERE sc.coach_user_id = v_uid
      ), '[]'::jsonb)
    );
  END IF;

  -- ── Parent ─────────────────────────────────────────────────
  -- The links and consents the parent themselves granted. Their child's
  -- records belong to the child and are exported from the child's account.
  IF v_role = 'parent' THEN
    v_out := v_out || jsonb_build_object(
      'child_links', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('player_user_id', l.player_user_id, 'created_at', l.created_at))
        FROM public.player_parent_links l WHERE l.parent_user_id = v_uid
      ), '[]'::jsonb),
      'consents_granted', COALESCE((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.granted_at)
        FROM public.parental_consents c WHERE c.parent_user_id = v_uid
      ), '[]'::jsonb)
    );
  END IF;

  -- ── Club admin ─────────────────────────────────────────────
  IF v_role = 'club' THEN
    v_out := v_out || jsonb_build_object(
      'organizations', COALESCE((
        SELECT jsonb_agg(to_jsonb(o) - 'admin_user_id')
        FROM public.organizations o WHERE o.admin_user_id = v_uid
      ), '[]'::jsonb),
      'admin_notes', COALESCE((
        SELECT jsonb_agg(to_jsonb(n) - 'admin_user_id' ORDER BY n.created_at)
        FROM public.admin_notes n WHERE n.admin_user_id = v_uid
      ), '[]'::jsonb)
    );
  END IF;

  RETURN v_out;
END;
$fn$;

-- ── The report days already published ───────────────────────────────────────
DO $$
BEGIN
 PERFORM trak_private.send_reports(e.id) FROM public.season_evaluations e;
END $$;
