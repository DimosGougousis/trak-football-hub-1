-- TRAK-527 (Reports 4/10, Imad 21 Nov): one player's report for one report day, for the coach. Report days cut the
-- season into periods: the report for `p_report_day` covers the day after `p_last_report_day` (or the season's first
-- day, when it's the first report) to the report day itself. A match, an assessment or an objective answer belongs to
-- the period its date falls in, every date the academy's.
--
-- coach_player_report() gathers what the report shows and nothing else, and the page works the bands out from it
-- (BANDS, scoreToBand), so the report and the player's page can't disagree. Reports 5/10 stores this same result when
-- the coach sends, so what was sent and what was shown are one thing.
--
--   assessments  every one of the coach's assessments of the player this season, up to the report day, oldest first:
--                the six ratings and the day; before_season, the latest from before it. The latest on or before a
--                day gives his bands then, so a player with none in the period shows his latest from before, and one
--                never assessed shows none. The season starts on the squad's plan's first day, or else 1 July.
--   matches      the period's matches with a published evaluation that has a row for him: day, opponent, home or
--                away, score, his job, whether he played, did the job (yes, partly, not_yet), against expectation.
--   objectives   his objectives during the period (open, or met in it), each with its latest answer at the last
--                report and on the report day, from squad evaluations (objective_progress) and assessments
--                (assessment_objectives).
--   trainings    the period's trainings, counted as child_training_attendance counts them: his squad's or the whole
--                roster's, register taken, from the day he joined; attended and total.
--
-- Only the player's own coach, while the player isn't waiting for consent. Coach-only: no family reads it (that is
-- Reports 6/10, from what 5/10 stores).
CREATE FUNCTION public.coach_player_report(p_squad_player_id uuid, p_report_day date, p_last_report_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_sp public.squad_players%ROWTYPE;
 v_zone text;
 v_season date;
 v_from date;
 v_out jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_coach() OR NOT public.squad_player_is_mine(p_squad_player_id) THEN
  RAISE EXCEPTION 'Not authorized for this player' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO v_sp FROM public.squad_players sp WHERE sp.id = p_squad_player_id;
 IF public.coach_squad_player_consent_required(v_sp.id) THEN
  RAISE EXCEPTION 'This player is waiting for consent' USING ERRCODE = '42501';
 END IF;
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
  SELECT ca.id, (ca.created_at AT TIME ZONE v_zone)::date AS day, ca.created_at,
    ca.work_rate, ca.tactical, ca.attitude, ca.technical, ca.physical, ca.coachability
  FROM public.coach_assessments ca
  WHERE ca.squad_player_id = v_sp.id AND ca.coach_user_id = v_sp.coach_user_id
    AND ca.work_rate IS NOT NULL AND ca.tactical IS NOT NULL AND ca.attitude IS NOT NULL
    AND ca.technical IS NOT NULL AND ca.physical IS NOT NULL AND ca.coachability IS NOT NULL
 ), answers AS (
  SELECT op.player_objective_id AS objective_id, op.status, (se.published_at AT TIME ZONE v_zone)::date AS day, se.published_at AS at
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
      'technical', a.technical, 'physical', a.physical, 'coachability', a.coachability) ORDER BY a.created_at)
    FROM assessed a WHERE a.day BETWEEN v_season AND p_report_day), '[]'::jsonb),
  -- The latest from before the season: his bands until his first assessment of it.
  'before_season', (SELECT jsonb_build_object('id', a.id, 'day', a.day,
      'work_rate', a.work_rate, 'tactical', a.tactical, 'attitude', a.attitude,
      'technical', a.technical, 'physical', a.physical, 'coachability', a.coachability)
    FROM assessed a WHERE a.day < v_season ORDER BY a.created_at DESC LIMIT 1),
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
        WHERE x.objective_id = o.id AND x.day <= p_last_report_day ORDER BY x.at DESC LIMIT 1) END,
      'now', (SELECT x.status FROM answers x WHERE x.objective_id = o.id AND x.day <= p_report_day ORDER BY x.at DESC LIMIT 1))
      ORDER BY o.status = 'met', o.slot, o.created_at)
    FROM objectives o), '[]'::jsonb),
  'trainings', jsonb_build_object('attended', (SELECT count(*) FILTER (WHERE t.here) FROM trainings t),
    'total', (SELECT count(*) FROM trainings t))
 ) INTO v_out;
 RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.coach_player_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_player_report(uuid, date, date) TO authenticated;
COMMENT ON FUNCTION public.coach_player_report(uuid, date, date) IS
  'TRAK-527: one player''s report for one report day (the period after the last report day), for the player''s own coach only.';
