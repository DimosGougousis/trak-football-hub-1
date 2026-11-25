-- Coach–player P18 (coach sends a task by hand): the coach picks the day a task is due, and the database turns it into
-- the moment it closes on the academy's clock, as events do since TRAK-175: the end of that day in the academy's time
-- zone, whatever the coach's phone says. So "Due Sat 29 Nov" means the player can answer until Saturday is over in
-- Athens or Dubai. A day already past in the academy is refused, and a manual task always has a day: with no day it
-- would stay on the player's Home for good.
--
-- create_task (20261125190000) took an instant and nothing calls it yet, so it is replaced rather than overloaded.
-- Every other check is as it was.

DROP FUNCTION public.create_task(text, uuid, text, text, timestamptz);

CREATE FUNCTION public.create_task(p_squad text, p_squad_player_id uuid, p_answer_kind text, p_title text, p_due_on date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_squad text := btrim(p_squad);
 v_org uuid := public.my_coach_organization_id();
 v_id uuid;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_coach() OR v_org IS NULL OR NOT trak_private.coaches_squad(v_squad) THEN
  RAISE EXCEPTION 'This squad isn''t one of yours' USING ERRCODE = '42501';
 END IF;
 IF NOT public.feature_on('tasks') THEN
  RAISE EXCEPTION 'Tasks are switched off for your academy' USING ERRCODE = '42501';
 END IF;
 IF p_squad_player_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.squad_players sp
   WHERE sp.id = p_squad_player_id AND sp.coach_user_id = (SELECT auth.uid()) AND btrim(sp.age_group) = v_squad
     AND sp.organization_id = v_org AND sp.status = 'active'
     AND NOT trak_private.squad_player_consent_required(sp.id)) THEN
  RAISE EXCEPTION 'This player isn''t on that squad, or is waiting for consent' USING ERRCODE = '42501';
 END IF;
 IF p_answer_kind IS NULL OR p_answer_kind NOT IN ('got_it', 'done', 'ready_for_review') THEN
  RAISE EXCEPTION 'Ask for Got it, Done or Ready for review' USING ERRCODE = '22023';
 END IF;
 IF p_due_on IS NULL OR p_due_on < trak_private.academy_today(v_org) THEN
  RAISE EXCEPTION 'Select a day from today on' USING ERRCODE = '22023';
 END IF;
 INSERT INTO public.trak_tasks (organization_id, coach_user_id, squad, squad_player_id, source_type, answer_kind, title, due_at)
 VALUES (v_org, (SELECT auth.uid()), v_squad, p_squad_player_id, 'manual', p_answer_kind, btrim(p_title),
   (p_due_on + 1)::timestamp AT TIME ZONE trak_private.academy_time_zone(v_org))
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_task(text, uuid, text, text, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_task(text, uuid, text, text, date) TO authenticated;
COMMENT ON FUNCTION public.create_task(text, uuid, text, text, date) IS
  'TRAK-578, P18: a coach sends a task by hand to their squad or one player on it, due by the end of p_due_on on the academy''s clock. Checks the coach, the squad, the tasks switch, the player and their consent, and that the day has not passed.';
