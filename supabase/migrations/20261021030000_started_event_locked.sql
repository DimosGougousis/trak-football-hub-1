-- TRAK-230 (J8, 20 Oct live run S4/S7; decided by Kostas 21 Oct, option A):
-- once an event has started, what families were told about it is fixed.
--
-- Rule, for the app's signed-in users:
-- - "Started" is the event's start instant (starts_at, on the academy's own
--   clock since TRAK-175). An old event with no start time locks when its day
--   is over, not at midnight.
-- - After that no column changes, except publishing a draft: the rehearsal runs
--   a register on an event that started earlier today, and a register needs a
--   published event. Cancelling is a change too, so a started event can't be
--   cancelled (the coach's event sheet already hides it, TRAK-182 16 Oct).
-- - updated_at and sequence are left out of the comparison: the stamp trigger
--   keeps them as they were when nothing changed.
-- - Saving it unchanged is not a change.
-- Not covered, on purpose: the register (coach_sessions, session_attendance)
-- and the match log are other tables and stay correctable (TRAK-185); deleting
-- a draft is a DELETE, unchanged. The operator (service key, SQL editor) can
-- still correct a row, as TRAK-184 did.
--
-- AFTER UPDATE, like the overlap rule, so it sees the row as the BEFORE
-- triggers (updated_at, stamp) left it; raising rolls the statement back.

CREATE FUNCTION trak_private.refuse_started_event_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NULL;
  END IF;
  IF (OLD.starts_at + (CASE WHEN OLD.start_time IS NULL THEN interval '1 day' ELSE interval '0' END)) > now() THEN
    RETURN NULL;
  END IF;
  IF (to_jsonb(NEW) - 'updated_at' - 'sequence' - 'published') = (to_jsonb(OLD) - 'updated_at' - 'sequence' - 'published')
     AND (NEW.published = OLD.published OR (NOT OLD.published AND NEW.published)) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'This event has started, so it can''t be changed. Use its register or match log instead.'
    USING ERRCODE = 'P0001';
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.refuse_started_event_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refuse_started_event_change
  AFTER UPDATE ON public.coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION trak_private.refuse_started_event_change();
