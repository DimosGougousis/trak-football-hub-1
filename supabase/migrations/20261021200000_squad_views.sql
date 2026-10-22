-- TRAK-250 (J8, Squad tab): coach-marked availability and the coach's season.
--
-- Availability follows the WhatsApp model. Families say who is coming in the
-- squad's WhatsApp group; the coach reads it and ticks each child Confirmed in
-- Trak. Everyone else is "Not confirmed". A row here is that tick, nothing
-- more: the coach's own note of what the group said. Families can't read it
-- because they never wrote it and Trak doesn't show it to them; their own
-- answer in the app stays "Can't make it" (event_absences, TRAK-137/183),
-- which this leaves untouched.
--
-- Only the event's coach writes, through the two functions below, for a child
-- on their own current squad row in the event's squad, once a guardian has
-- consented (G1), on a published, scheduled event of an academy with events
-- switched on (J8.1), until the end of the event's day in the academy's zone
-- (TRAK-175), so the coach can still fix it on the day. Nobody writes the
-- table directly.
--
-- Season: coaches can't read matches directly. coach_squad_season returns the
-- coach's own logged matches (logged_by = the coach, as a coach) for children
-- on their own current squad rows, one row per child per match.

CREATE TABLE public.event_confirmations (
  event_id uuid NOT NULL REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, squad_player_id)
);
CREATE INDEX event_confirmations_squad_player ON public.event_confirmations (squad_player_id);
ALTER TABLE public.event_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_confirmations TO authenticated;

CREATE POLICY "Coaches read their events' confirmations" ON public.event_confirmations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_calendar_events e
                 WHERE e.id = event_id AND e.coach_user_id = (SELECT auth.uid())));

-- Every check for the caller to confirm or unconfirm this squad row on this
-- event; raises a screen-readable 42501 otherwise. The events switch is the
-- academy_features row, as in absence_target.
CREATE FUNCTION trak_private.confirmation_target(p_event_id uuid, p_squad_player_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_event public.coach_calendar_events;
  v_tz text;
BEGIN
  SELECT * INTO v_event FROM public.coach_calendar_events WHERE id = p_event_id;
  IF v_event.id IS NULL OR v_event.coach_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the event''s coach can confirm attendance' USING ERRCODE = '42501';
  END IF;
  IF NOT public.squad_player_is_mine(p_squad_player_id) OR NOT EXISTS (
    SELECT 1 FROM public.squad_players sp
    WHERE sp.id = p_squad_player_id
      AND sp.coach_user_id = v_event.coach_user_id
      AND sp.organization_id IS NOT DISTINCT FROM v_event.organization_id
      AND sp.status <> 'coach_departed'
      AND (v_event.squad IS NULL OR sp.age_group = v_event.squad)
  ) THEN
    RAISE EXCEPTION 'This child is not in this event''s squad' USING ERRCODE = '42501';
  END IF;
  IF public.coach_squad_player_consent_required(p_squad_player_id) THEN
    RAISE EXCEPTION 'Waiting for consent: nothing is recorded about this child until a guardian approves' USING ERRCODE = '42501';
  END IF;
  IF NOT v_event.published THEN
    RAISE EXCEPTION 'This event is not published' USING ERRCODE = '42501';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'This event is cancelled' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academy_features f
                 WHERE f.organization_id = v_event.organization_id AND f.feature = 'events') THEN
    RAISE EXCEPTION 'Events are switched off for this academy' USING ERRCODE = '42501';
  END IF;

  -- Until the end of the event's day, so the coach can fix it on the day.
  v_tz := trak_private.academy_time_zone(v_event.organization_id);
  IF now() >= ((COALESCE(v_event.event_date, (v_event.starts_at AT TIME ZONE v_tz)::date) + 1)::timestamp AT TIME ZONE v_tz) THEN
    RAISE EXCEPTION 'This event has ended' USING ERRCODE = '42501';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.confirmation_target(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.confirm_event_attendance(p_event_id uuid, p_squad_player_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  PERFORM trak_private.confirmation_target(p_event_id, p_squad_player_id);
  INSERT INTO public.event_confirmations (event_id, squad_player_id, confirmed_by)
  VALUES (p_event_id, p_squad_player_id, auth.uid())
  ON CONFLICT (event_id, squad_player_id) DO NOTHING;
END;
$fn$;

-- The checks run first and always, not inside the DELETE's WHERE, so an
-- unconfirm after the event's day with nothing to undo is still refused.
CREATE FUNCTION public.unconfirm_event_attendance(p_event_id uuid, p_squad_player_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  PERFORM trak_private.confirmation_target(p_event_id, p_squad_player_id);
  DELETE FROM public.event_confirmations
  WHERE event_id = p_event_id AND squad_player_id = p_squad_player_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.confirm_event_attendance(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unconfirm_event_attendance(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_event_attendance(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unconfirm_event_attendance(uuid, uuid) TO authenticated;

-- One row per child per match the caller logged as a coach, for children on
-- the caller's own current squad rows (optionally one squad). A child on two
-- of the coach's rows appears once per match. A colleague's or a player's own
-- logs never count. Minutes not recorded stay NULL.
CREATE FUNCTION public.coach_squad_season(p_from date, p_to date, p_squad text DEFAULT NULL)
RETURNS TABLE (
  match_date date,
  opponent text,
  session_id uuid,
  team_score integer,
  opponent_score integer,
  squad_player_id uuid,
  minutes_played integer,
  goals integer,
  assists integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT r.match_date, r.opponent, r.session_id, r.team_score, r.opponent_score,
         r.squad_player_id, r.minutes_played, r.goals, r.assists
  FROM (
    SELECT DISTINCT ON (m.id)
           m.match_date, m.opponent, m.session_id, m.team_score, m.opponent_score,
           sp.id AS squad_player_id, m.minutes_played, m.goals, m.assists
    FROM public.matches m
    JOIN public.squad_players sp ON sp.linked_player_id = m.user_id
    WHERE sp.coach_user_id = (SELECT auth.uid())
      AND public.squad_player_is_mine(sp.id)
      AND m.logged_by = (SELECT auth.uid())
      AND m.logged_by_role = 'coach'
      AND m.match_date BETWEEN p_from AND p_to
      AND (p_squad IS NULL OR sp.age_group = p_squad)
    ORDER BY m.id, sp.id
  ) r
  ORDER BY r.match_date, r.opponent;
$fn$;
REVOKE ALL ON FUNCTION public.coach_squad_season(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_squad_season(date, date, text) TO authenticated;
