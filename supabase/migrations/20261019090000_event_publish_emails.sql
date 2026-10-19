-- TRAK-135 (Imad and Kostas, 16 Oct): publishing an event emails families
-- too, not only a change or a cancellation. Same recipients and rules as the
-- change email (event_change_recipients), same sender. One email per publish:
-- a series published at once queues one notice per date, all due together, so
-- send-event-emails makes one email per person listing the dates.
--
-- Publishing queues a 'published' notice for the academy's today or later
-- that hasn't started yet (a past event isn't news). An edit inside the 15 s window keeps the notice
-- 'published', so the email shows the final state and never "old → new"
-- (families never saw the draft). A cancel inside the window leaves it
-- 'published' too; the sender sees the event cancelled and sends nothing.
-- Only queue_event_change_notice() changes: this replaces its latest version
-- (20261014180000_academy_time_zone.sql) and adds the publish branch.

ALTER TABLE public.event_change_notices DROP CONSTRAINT event_change_notices_kind_check;
ALTER TABLE public.event_change_notices ADD CONSTRAINT event_change_notices_kind_check
  CHECK (kind IN ('cancelled', 'changed', 'published'));

CREATE OR REPLACE FUNCTION trak_private.queue_event_change_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_today date := trak_private.academy_today(NEW.organization_id);
  v_kind text;
BEGIN
  IF NOT OLD.published AND NEW.published THEN
    -- TRAK-135: a draft becomes something families can see. One published
    -- after it has started isn't news either (Imad, 19 Oct).
    IF NEW.status = 'scheduled' AND trak_private.event_day(NEW) >= v_today
      AND (NEW.starts_at IS NULL OR NEW.starts_at > now()) THEN
      v_kind := 'published';
    ELSE
      RETURN NULL;
    END IF;
  -- Otherwise families only ever had a published event.
  ELSIF NOT (OLD.published AND NEW.published) THEN
    RETURN NULL;
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'cancelled' THEN
    -- A called-off fixture never just disappears, whatever its date (Imad, 9 Oct).
    v_kind := 'cancelled';
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'scheduled'
    AND (OLD.event_date, OLD.start_time, OLD.end_time, OLD.meet_time, OLD.venue, OLD.starts_at)
        IS DISTINCT FROM (NEW.event_date, NEW.start_time, NEW.end_time, NEW.meet_time, NEW.venue, NEW.starts_at)
    -- Moved onto, or away from, today or tomorrow: either way families need to know now.
    AND (trak_private.event_day(OLD) IN (v_today, v_today + 1)
         OR trak_private.event_day(NEW) IN (v_today, v_today + 1)) THEN
    v_kind := 'changed';
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.event_change_notices (event_id, kind, before, due_at)
  VALUES (NEW.id, v_kind, trak_private.event_email_fields(OLD), now() + interval '15 seconds')
  ON CONFLICT (event_id) WHERE status = 'pending'
  -- Keep the first "before"; the email shows the final state against it. A
  -- notice that is still 'published' stays so: families haven't seen it yet.
  DO UPDATE SET
    kind = CASE WHEN public.event_change_notices.kind = 'published' THEN 'published' ELSE EXCLUDED.kind END,
    due_at = EXCLUDED.due_at;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION trak_private.queue_event_change_notice() FROM PUBLIC, anon, authenticated;
