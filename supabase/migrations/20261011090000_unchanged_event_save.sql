-- TRAK-152 (J8.2): saving an event without changing anything changes nothing
-- families see.
--
-- 20261009160000 bumped the change counter on every UPDATE, and the
-- updated_at trigger moves the change time on every UPDATE. So a coach who
-- opened a published event and pressed Save unchanged sent every family's
-- bell a "Changed" (TRAK-134 counts updated_at) and every calendar feed a new
-- SEQUENCE (J8.9). Now, when the row is the same apart from those two stamps,
-- both are kept. The row is still written, so the app still gets its id back
-- and counts the save as saved.
--
-- Same function as 20261009160000 otherwise. It runs after
-- trg_coach_calendar_events_updated_at (BEFORE triggers fire in name order),
-- so OLD.updated_at can be put back here.

CREATE OR REPLACE FUNCTION public.stamp_calendar_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.organization_id := (SELECT cd.organization_id FROM public.coach_details cd
                            WHERE cd.user_id = NEW.coach_user_id);
    NEW.sequence := 0;
  ELSE
    IF OLD.published AND NOT NEW.published THEN
      RAISE EXCEPTION 'published_event_cannot_return_to_draft' USING ERRCODE = '42501';
    END IF;
    -- The one way out of the pin is the FK's own ON DELETE SET NULL, once the
    -- academy is gone (20260918224500's carve-out 2). Pinning that too would
    -- block deleting the academy and its admin's account.
    IF NEW.organization_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = OLD.organization_id) THEN
      NEW.organization_id := OLD.organization_id;
    END IF;
    -- Compared after the pin, so an academy or counter the app sent counts as
    -- nothing changed.
    IF (to_jsonb(NEW) - 'updated_at' - 'sequence') = (to_jsonb(OLD) - 'updated_at' - 'sequence') THEN
      NEW.sequence := OLD.sequence;
      NEW.updated_at := OLD.updated_at;
    ELSE
      NEW.sequence := OLD.sequence + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.stamp_calendar_event() FROM PUBLIC, anon, authenticated;
