-- TRAK-294 (Training 1/5, spec TRAK-293): the Training tab turns on per academy
-- with the switch events and Games use. Rehearsal FC first; a real academy only
-- by a founder decision. The operator runs one line either way:
--   on:  INSERT INTO public.academy_features(organization_id, feature) VALUES ('<academy id>', 'training');
--   off: DELETE FROM public.academy_features WHERE organization_id = '<academy id>' AND feature = 'training';
-- No row means off. A new academy still starts with events only (the trigger
-- from 20261017120000 is unchanged).
--
-- My drills: a coach's own single drills, to reuse in any session (Kostas,
-- 27 Oct: whole sessions are kept as plans, TRAK-295, not here). Only their
-- coach ever reads or writes them; no player, guardian, other coach or admin.
-- Writes also need the academy's training switch on. Reads don't, so switching
-- Training off hides the tab without losing anyone's drills.

ALTER TABLE public.academy_features
  DROP CONSTRAINT academy_features_feature_check,
  ADD CONSTRAINT academy_features_feature_check CHECK (feature IN ('events', 'games', 'training'));

CREATE TABLE public.coach_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
  -- The usual length. The app offers 10 to 30; the room either side is for later.
  minutes smallint NOT NULL CHECK (minutes BETWEEN 5 AND 60),
  how text NOT NULL DEFAULT '' CHECK (char_length(how) <= 1000),
  tell text NOT NULL DEFAULT '' CHECK (char_length(tell) <= 500),
  -- The five details every Trak practice can carry (mockup: "Add details").
  area text NOT NULL DEFAULT '' CHECK (char_length(area) <= 120),
  numbers text NOT NULL DEFAULT '' CHECK (char_length(numbers) <= 120),
  direction text NOT NULL DEFAULT '' CHECK (char_length(direction) <= 120),
  targets text NOT NULL DEFAULT '' CHECK (char_length(targets) <= 120),
  conditions text NOT NULL DEFAULT '' CHECK (char_length(conditions) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_drills_coach ON public.coach_drills (coach_user_id, updated_at DESC);
CREATE TRIGGER coach_drills_updated_at BEFORE UPDATE ON public.coach_drills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coach_drills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_drills FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_drills TO authenticated;

CREATE POLICY "Coaches read their own drills" ON public.coach_drills
  FOR SELECT TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));
CREATE POLICY "Coaches add their own drills" ON public.coach_drills
  FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach());
CREATE POLICY "Coaches change their own drills" ON public.coach_drills
  FOR UPDATE TO authenticated
  USING (coach_user_id = (SELECT auth.uid()))
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach());
CREATE POLICY "Coaches delete their own drills" ON public.coach_drills
  FOR DELETE TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));

-- The switch is restrictive, as events' is: no stray grant or permissive
-- policy can open writes for an academy that is off.
CREATE POLICY "Training switch gates drill inserts" ON public.coach_drills
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('training')));
CREATE POLICY "Training switch gates drill updates" ON public.coach_drills
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_coach() AND (SELECT public.feature_on('training')))
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('training')));
CREATE POLICY "Training switch gates drill deletes" ON public.coach_drills
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (public.is_coach() AND (SELECT public.feature_on('training')));
