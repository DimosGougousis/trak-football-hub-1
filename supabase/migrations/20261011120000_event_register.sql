-- TRAK-138 (J8.15): after the event, the coach's register becomes the
-- completed session that assessments already require (TRAK-68), without
-- re-entering the date, squad or players.
--
-- A session remembers the event it came from (coach_sessions.event_id), one
-- session per event, so saving the register twice never makes a second one.
-- take_event_register() runs as the coach (SECURITY INVOKER): the J4 write
-- path's own policies apply unchanged, so it can only write the coach's
-- sessions, attendance for their current squad, and never attendance for a
-- child whose consent isn't active (G1). It checks consent first only to say
-- so in words. Attendance becomes exactly the list sent: present rows only,
-- as the J4 screens write; a player left off is absent. The database still
-- refuses to remove an assessed player's attendance (TRAK-100).
--
-- Only a published event that went ahead and has started (TRAK-67: never a
-- future session). A match goes through the match log, which records the
-- score, minutes and goals.

ALTER TABLE public.coach_sessions
  ADD COLUMN event_id uuid REFERENCES public.coach_calendar_events(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX coach_sessions_one_per_event ON public.coach_sessions (event_id) WHERE event_id IS NOT NULL;
COMMENT ON COLUMN public.coach_sessions.event_id IS
  'TRAK-138 (J8.15). The scheduled event this session completes; at most one session per event.';

CREATE FUNCTION public.take_event_register(p_event_id uuid, p_present uuid[])
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  e public.coach_calendar_events;
  v_session uuid;
  v_player uuid;
BEGIN
  SELECT * INTO e FROM public.coach_calendar_events ev
  WHERE ev.id = p_event_id AND ev.coach_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This event is not on your schedule' USING ERRCODE = 'P0001';
  END IF;
  IF NOT e.published THEN
    RAISE EXCEPTION 'Only a published event has a register' USING ERRCODE = 'P0001';
  END IF;
  IF e.status = 'cancelled' THEN
    RAISE EXCEPTION 'This event was cancelled, so it has no register' USING ERRCODE = 'P0001';
  END IF;
  IF e.event_type NOT IN ('training', 'other') THEN
    RAISE EXCEPTION 'A match is recorded in the match log, with its score and minutes' USING ERRCODE = 'P0001';
  END IF;
  -- The coach's wall clock is Dubai's (event_date + start_time); an event
  -- with no time yet opens at the start of its day.
  IF COALESCE((e.event_date + COALESCE(e.start_time, time '00:00')) AT TIME ZONE 'Asia/Dubai', e.starts_at) > now() THEN
    RAISE EXCEPTION 'The register opens once the event has started' USING ERRCODE = 'P0001';
  END IF;

  -- Consent first, to say why in words; the attendance policy refuses anyway.
  -- Another coach's player is refused here with 42501.
  FOREACH v_player IN ARRAY COALESCE(p_present, '{}'::uuid[]) LOOP
    IF public.coach_squad_player_consent_required(v_player) THEN
      RAISE EXCEPTION 'Waiting for parent: nothing is recorded about player % until a parent approves', v_player
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.coach_sessions (coach_user_id, title, session_type, session_date, venue, event_id)
  VALUES (auth.uid(), e.title, e.event_type,
          COALESCE(e.event_date, (e.starts_at AT TIME ZONE 'Asia/Dubai')::date), e.venue, e.id)
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_session;
  IF v_session IS NULL THEN
    SELECT s.id INTO v_session FROM public.coach_sessions s WHERE s.event_id = e.id;
  END IF;

  DELETE FROM public.session_attendance a
  WHERE a.session_id = v_session AND a.squad_player_id <> ALL (COALESCE(p_present, '{}'::uuid[]));
  -- An older row with another status becomes present rather than gaining a twin.
  UPDATE public.session_attendance a SET status = 'present'
  WHERE a.session_id = v_session AND a.status <> 'present';
  INSERT INTO public.session_attendance (session_id, squad_player_id, status)
  SELECT v_session, p, 'present' FROM (SELECT DISTINCT unnest(COALESCE(p_present, '{}'::uuid[])) AS p) d
  WHERE NOT EXISTS (SELECT 1 FROM public.session_attendance a WHERE a.session_id = v_session AND a.squad_player_id = p);

  RETURN v_session;
END;
$fn$;
REVOKE ALL ON FUNCTION public.take_event_register(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_event_register(uuid, uuid[]) TO authenticated;
COMMENT ON FUNCTION public.take_event_register(uuid, uuid[]) IS
  'TRAK-138 (J8.15). The coach saves a past event''s register: one completed session per event, attendance exactly the present list, under the J4 write policies.';
