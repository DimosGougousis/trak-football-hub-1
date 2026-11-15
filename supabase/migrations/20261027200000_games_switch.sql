-- TRAK-283 (Games 1/8): the Games tab turns on per academy with the switch
-- events use (TRAK-124). Rehearsal FC is switched on first; a real academy only
-- by a founder decision. The operator runs one line either way:
--   on:  INSERT INTO public.academy_features(organization_id, feature) VALUES ('<academy id>', 'games');
--   off: DELETE FROM public.academy_features WHERE organization_id = '<academy id>' AND feature = 'games';
-- No row means off. A new academy still starts with events only: the trigger
-- from 20261017120000 is unchanged, so Games stays off until it is switched on.

ALTER TABLE public.academy_features
  DROP CONSTRAINT academy_features_feature_check,
  ADD CONSTRAINT academy_features_feature_check CHECK (feature IN ('events', 'games'));
