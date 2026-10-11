-- TRAK-138 (J8.15), part 2: a session can only complete the coach's own event.
--
-- coach_sessions.event_id (20261011120000) is written by take_event_register(),
-- but the J4 insert and update policies only check coach_user_id, and a
-- foreign key check doesn't go through RLS. So a coach who knew another
-- coach's event id could hang a session on it, and that coach's register would
-- then find a session that isn't theirs (Tarek, #272). Event ids aren't shown
-- across coaches, so this closes a path rather than a known leak.
--
-- Restrictive, so it adds to the existing policies without restating them: a
-- session with no event is unaffected (every J4 save today).
CREATE POLICY "A session completes only the coach's own event"
  ON public.coach_sessions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (event_id IS NULL OR EXISTS (
    SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = event_id AND e.coach_user_id = (SELECT auth.uid())));

CREATE POLICY "A session moves only to the coach's own event"
  ON public.coach_sessions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (event_id IS NULL OR EXISTS (
    SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = event_id AND e.coach_user_id = (SELECT auth.uid())));
