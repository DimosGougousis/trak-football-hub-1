-- TRAK-124 (reopened after live run 3, 16 Oct): every academy has events on
-- unless the founders say otherwise. Rehearsal Athens was created without its
-- switch row, so its coach saw "Coming soon" until the row was added by hand
-- mid-run. Imad, 17 Oct: "every new academy, every academy in general, should
-- start with events on, unless instructed otherwise."
-- One trigger covers every path that creates an academy, and existing
-- academies are switched on once here. The off switch is unchanged: deleting
-- the row turns events off, with no deploy.

CREATE FUNCTION public.new_academy_starts_with_events_on()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.academy_features(organization_id, feature)
  VALUES (NEW.id, 'events')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.new_academy_starts_with_events_on() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER new_academy_starts_with_events_on
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.new_academy_starts_with_events_on();

-- Existing academies: on, once (on 17 Oct only Rehearsal United was off).
INSERT INTO public.academy_features(organization_id, feature)
SELECT id, 'events' FROM public.organizations
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations o WHERE NOT EXISTS (
    SELECT 1 FROM public.academy_features f WHERE f.organization_id = o.id AND f.feature = 'events')) THEN
    RAISE EXCEPTION 'An academy is still without events after the switch-on';
  END IF;
END $$;
