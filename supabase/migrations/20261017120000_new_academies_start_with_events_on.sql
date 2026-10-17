-- TRAK-124 (reopened after live run 3, 16 Oct): a new academy starts with
-- events on. Rehearsal Athens was created without its switch row, so its coach
-- saw "Coming soon" until the row was added by hand mid-run. Imad, 16 Oct: a
-- new academy must never start with events off.
-- One trigger covers every path that creates an academy. Existing academies
-- keep the switch they have (Rehearsal United stays off). The off switch is
-- unchanged: deleting the row turns events off, with no deploy.

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
