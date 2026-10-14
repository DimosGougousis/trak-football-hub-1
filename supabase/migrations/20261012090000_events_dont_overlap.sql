-- TRAK-158 (J8.4): a coach's live events can't overlap.
--
-- 11 Oct live run: a match 17:00-18:30 and a training 18:00-19:30 on the same
-- Friday were both published; the squad can't be at both, and nothing warned
-- the coach. Rule (Kostas, 11 Oct; Imad asked to agree on TRAK-158):
-- - a published, not cancelled event can't overlap another of the same
--   coach's published, not cancelled events on the same Dubai day;
-- - drafts may overlap (still planning): checked when published;
-- - back-to-back is fine (one ends 18:00, the next starts 18:00);
-- - a start with no end counts as 90 minutes, the form's default length;
-- - an event with no start time ("Time not set yet") isn't checked until it
--   gets one;
-- - a live event is checked when it's published, un-cancelled, or its day or
--   times change, so an old clash doesn't block a venue edit or a cancel.
--
-- An AFTER row trigger, so one statement publishing two clashing drafts sees
-- both. Two phones saving in the same instant can still race (each statement
-- reads before the other commits); the advisory lock narrows that to the same
-- moment, which the J8 rehearsal accepts.

-- The event's wall-clock end on its Dubai day: its end time, else its end
-- instant read in Dubai, else 90 minutes after the start.
CREATE FUNCTION trak_private.event_wall_end(p_date date, p_start time, p_end time, p_ends_at timestamptz)
RETURNS timestamp
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN p_end IS NOT NULL AND p_end > p_start THEN p_date + p_end
    WHEN p_ends_at IS NOT NULL THEN p_ends_at AT TIME ZONE 'Asia/Dubai'
    ELSE p_date + p_start + interval '90 minutes'
  END
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_wall_end(date, time, time, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION trak_private.refuse_event_overlap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_start timestamp;
  v_end timestamp;
  v_clash record;
BEGIN
  IF NOT NEW.published OR NEW.status = 'cancelled' OR NEW.event_date IS NULL OR NEW.start_time IS NULL THEN
    RETURN NULL;
  END IF;
  -- Already live and nothing about when it is changed: an old clash stays editable.
  IF TG_OP = 'UPDATE' AND OLD.published AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.event_date IS NOT DISTINCT FROM NEW.event_date
     AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time
     AND OLD.end_time IS NOT DISTINCT FROM NEW.end_time
     AND OLD.ends_at IS NOT DISTINCT FROM NEW.ends_at THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.coach_user_id::text || '|' || NEW.event_date::text, 158));
  v_start := NEW.event_date + NEW.start_time;
  v_end := trak_private.event_wall_end(NEW.event_date, NEW.start_time, NEW.end_time, NEW.ends_at);

  SELECT e.title, e.event_date + e.start_time AS starts,
         trak_private.event_wall_end(e.event_date, e.start_time, e.end_time, e.ends_at) AS ends
    INTO v_clash
  FROM public.coach_calendar_events e
  WHERE e.coach_user_id = NEW.coach_user_id
    AND e.id <> NEW.id
    AND e.published
    AND e.status IS DISTINCT FROM 'cancelled'
    AND e.event_date = NEW.event_date
    AND e.start_time IS NOT NULL
    AND e.event_date + e.start_time < v_end
    AND trak_private.event_wall_end(e.event_date, e.start_time, e.end_time, e.ends_at) > v_start
  ORDER BY e.start_time, e.title
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This overlaps %, %–%. Change the time or cancel one.',
      v_clash.title, to_char(v_clash.starts, 'HH24:MI'), to_char(v_clash.ends, 'HH24:MI')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.refuse_event_overlap() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refuse_event_overlap
  AFTER INSERT OR UPDATE ON public.coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION trak_private.refuse_event_overlap();
