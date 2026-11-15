-- TRAK-219 (J4/J5, 20 Oct live run, S7): an assessment never says "Didn't play".
--
-- A player who didn't play isn't assessed (Imad, 19 Oct, option A), and an
-- assessment on a session needs the player marked present there (TRAK-100),
-- which for a match is the log saying they played. So 'didnt_play' on an
-- assessment always contradicts the record. The app stopped offering it; this
-- holds for an old cached app or a direct API call too.
--
-- Checked on prod (20 Oct, read-only): no assessment has 'didnt_play', so the
-- constraint is validated as it is added. Other values ('started', 'sub',
-- 'training', null) are left as they are.

ALTER TABLE public.coach_assessments
  ADD CONSTRAINT coach_assessments_never_didnt_play CHECK (appearance IS DISTINCT FROM 'didnt_play');
