-- TRAK-183 (J8.14 follow-up, Imad 15 Oct): a player who consents for
-- themselves says "Can't make it" for their own events, as a guardian does.
-- "Consents for themselves" means at or above their academy's consent age
-- (TRAK-177, 20261015090000), never just "consent satisfied": an approved
-- 12-year-old passes that too and still goes through a guardian. Every other
-- check is unchanged: active consent, published, scheduled, events on, current
-- squad, before kickoff in the academy's zone (20261014180000).

-- The squad row is the caller's own, and the caller is old enough to consent
-- for themselves. Answers only for the caller, so nobody learns another
-- person's age band through it.
CREATE FUNCTION trak_private.my_own_absence_row(p_squad_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.squad_players sp
    WHERE sp.id = p_squad_player_id AND sp.linked_player_id = (SELECT auth.uid())
  ) AND COALESCE(public.player_age_years(auth.uid()) >= public.player_consent_age(auth.uid()), false);
$function$;
REVOKE ALL ON FUNCTION trak_private.my_own_absence_row(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.my_own_absence_row(uuid) TO authenticated, service_role;

CREATE POLICY "Players who consent for themselves read their own absences" ON public.event_absences
  FOR SELECT TO authenticated
  USING (trak_private.my_own_absence_row(squad_player_id));

-- As 20261014180000, with one change: the caller may also be the player,
-- when they are old enough to consent for themselves.
CREATE OR REPLACE FUNCTION trak_private.absence_target(p_event_id uuid, p_child uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_event public.coach_calendar_events;
  v_squad_player uuid;
  v_deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    EXISTS (
      SELECT 1 FROM public.player_parent_links l
      WHERE l.player_user_id = p_child AND l.parent_user_id = auth.uid()
    )
    OR (p_child = auth.uid()
        AND COALESCE(public.player_age_years(p_child) >= public.player_consent_age(p_child), false))
  ) THEN
    RAISE EXCEPTION 'Only a linked guardian, or a player old enough to consent for themselves, can say a child can''t make it' USING ERRCODE = '42501';
  END IF;
  IF public.player_consent_required(p_child) THEN
    RAISE EXCEPTION 'Waiting for consent: nothing is recorded about this child until a guardian approves' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event FROM public.coach_calendar_events WHERE id = p_event_id;
  SELECT sp.id INTO v_squad_player FROM public.squad_players sp
  WHERE sp.linked_player_id = p_child
    AND sp.coach_user_id = v_event.coach_user_id
    AND sp.organization_id = v_event.organization_id
    AND sp.status <> 'coach_departed'
  LIMIT 1;
  IF NOT FOUND OR v_event.id IS NULL OR NOT v_event.published THEN
    RAISE EXCEPTION 'This event is not available for this child' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academy_features f
                 WHERE f.organization_id = v_event.organization_id AND f.feature = 'events') THEN
    RAISE EXCEPTION 'Events are switched off for this academy' USING ERRCODE = '42501';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'This event is cancelled' USING ERRCODE = '42501';
  END IF;

  v_deadline := CASE
    WHEN v_event.event_date IS NULL THEN v_event.starts_at
    WHEN v_event.start_time IS NULL
      THEN (v_event.event_date + 1)::timestamp AT TIME ZONE trak_private.academy_time_zone(v_event.organization_id)
    ELSE (v_event.event_date + v_event.start_time) AT TIME ZONE trak_private.academy_time_zone(v_event.organization_id)
  END;
  IF now() >= v_deadline THEN
    RAISE EXCEPTION 'This event has started; tell the coach directly' USING ERRCODE = '42501';
  END IF;
  RETURN v_squad_player;
END;
$function$;
