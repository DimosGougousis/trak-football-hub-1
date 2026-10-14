-- TRAK-157 (J8.4): every event has a start time (Imad, 12 Oct).
--
-- The 11 Oct live run saved 8 published trainings with no time: a half-typed
-- time field read as empty. The form now needs a time picked whole from a
-- list, and the database holds the same rule, so a second phone, an old app
-- or a series save can't skip it.
--
-- A trigger, not a NOT NULL or CHECK constraint, because prod already has
-- events with no time (at least the live run's 8). A constraint, even NOT
-- VALID, is checked on every UPDATE, so the coach couldn't even cancel one
-- of those. Refused instead:
--   * a new event with no start time;
--   * clearing the start time of an event that has one;
--   * publishing an event that has none.
-- An old untimed event can still be cancelled, or edited in any other way,
-- and gets a time the next time the coach saves it in the app.

CREATE FUNCTION trak_private.refuse_event_without_start_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.start_time IS NULL AND (
       TG_OP = 'INSERT'
       OR OLD.start_time IS NOT NULL
       OR (NEW.published AND NOT OLD.published)
     ) THEN
    RAISE EXCEPTION 'Pick a start time: every event needs one.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.refuse_event_without_start_time() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refuse_event_without_start_time
  BEFORE INSERT OR UPDATE ON public.coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION trak_private.refuse_event_without_start_time();
