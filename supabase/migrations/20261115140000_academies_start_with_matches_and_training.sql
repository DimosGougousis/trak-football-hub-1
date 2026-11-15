-- TRAK-470. Imad, 15 Nov: "matches and training should always be on for any academy, test or not, always on."
-- (12 Nov, TRAK-435: "All academies will have matches on, no matter what, it is part of Trak now.")
-- Until now a new academy started with events only, and an operator added the 'games' and 'training' rows by hand:
-- Trak Test Academy, made on 14 Nov, showed "Coming soon" on Matches and had no Training tab.
--
-- The trigger from 20261017120000 that gives a new academy events now gives it Matches and Training too, and every
-- existing academy is switched on once here. Nothing that reads a switch changes. Deleting a row still turns that
-- part off with no deploy, as for events.

CREATE OR REPLACE FUNCTION public.new_academy_starts_with_events_on()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.academy_features(organization_id, feature)
  SELECT NEW.id, f FROM unnest(ARRAY['events', 'games', 'training']) f
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

-- Existing academies: on, once (on 15 Nov: Rehearsal United and Rehearsal Athens had neither).
INSERT INTO public.academy_features(organization_id, feature)
SELECT o.id, f FROM public.organizations o CROSS JOIN unnest(ARRAY['games', 'training']) f
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations o CROSS JOIN unnest(ARRAY['events', 'games', 'training']) f
    WHERE NOT EXISTS (SELECT 1 FROM public.academy_features a WHERE a.organization_id = o.id AND a.feature = f)) THEN
    RAISE EXCEPTION 'An academy is still without events, Matches or Training after the switch-on';
  END IF;
END $$;
