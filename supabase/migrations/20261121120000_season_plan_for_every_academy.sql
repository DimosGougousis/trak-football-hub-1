-- TRAK-524 (Reports 1/10). Imad, 21 Nov: Season plan is part of Trak for every academy, like Matches and Training.
-- Until now 'season_plan' was one academy_features row an operator added by hand (on 21 Nov: Rehearsal FC and Trak
-- Test Academy only), so coaches of every other academy had no Season plan.
--
-- The trigger that gives a new academy events, Matches, Training and the new look (20261116130000) now gives it Season
-- plan too, and every existing academy is switched on once here. Nothing that reads the switch changes: a squad with no
-- shared plan still assesses player by player. Deleting the row still turns Season plan off for that academy with no
-- deploy.

CREATE OR REPLACE FUNCTION public.new_academy_starts_with_events_on()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.academy_features(organization_id, feature)
  SELECT NEW.id, f FROM unnest(ARRAY['events', 'games', 'training', 'family_look', 'season_plan']) f
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

-- Existing academies: on, once (on 21 Nov: Rehearsal United and Rehearsal Athens had it off).
INSERT INTO public.academy_features(organization_id, feature)
SELECT o.id, 'season_plan' FROM public.organizations o
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations o
    WHERE NOT EXISTS (SELECT 1 FROM public.academy_features a WHERE a.organization_id = o.id AND a.feature = 'season_plan')) THEN
    RAISE EXCEPTION 'An academy is still without Season plan after the switch-on';
  END IF;
END $$;
