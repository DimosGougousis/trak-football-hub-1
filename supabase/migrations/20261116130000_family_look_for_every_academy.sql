-- TRAK-441. Imad, 16 Nov: the family app in the coach's look is on for every academy ("Switch it on everywhere").
-- Until now 'family_look' was one academy_features row an operator added by hand (Rehearsal FC since 12 Nov, Trak Test
-- Academy since 15 Nov), so players and parents of every other academy still got the older screens.
--
-- The trigger that gives a new academy events, Matches and Training (20261115140000) now gives it the new look too, and
-- every existing academy is switched on once here. Nothing that reads the switch changes. Deleting the row still turns
-- the new look off for that academy with no deploy.

CREATE OR REPLACE FUNCTION public.new_academy_starts_with_events_on()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.academy_features(organization_id, feature)
  SELECT NEW.id, f FROM unnest(ARRAY['events', 'games', 'training', 'family_look']) f
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

-- Existing academies: on, once (on 16 Nov: Rehearsal United and Rehearsal Athens had it off).
INSERT INTO public.academy_features(organization_id, feature)
SELECT o.id, 'family_look' FROM public.organizations o
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations o
    WHERE NOT EXISTS (SELECT 1 FROM public.academy_features a WHERE a.organization_id = o.id AND a.feature = 'family_look')) THEN
    RAISE EXCEPTION 'An academy is still without the family look after the switch-on';
  END IF;
END $$;
