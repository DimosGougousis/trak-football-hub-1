-- A training's theme, picked on New event: one of the Coaching Session
-- Catalogue's seven libraries, so the coach can open the catalogue on it and
-- choose sessions. The app's keys live in src/lib/training-theme.ts; change
-- both together.
--
-- Coach-only for now: child_events() does not return it, so families and
-- players see nothing new. Only a training has a theme.

ALTER TABLE public.coach_calendar_events
  ADD COLUMN training_theme text
  CONSTRAINT coach_calendar_events_training_theme_known CHECK (training_theme IN (
    'technical', 'attacking', 'defending', 'transition', 'goalkeeping', 'physical', 'psychological')),
  ADD CONSTRAINT coach_calendar_events_training_theme_training_only
    CHECK (training_theme IS NULL OR event_type = 'training');

COMMENT ON COLUMN public.coach_calendar_events.training_theme IS
  'The training''s Coaching Session Catalogue library (technical, attacking, defending, transition, goalkeeping, physical, psychological). Trainings only; coach-only, not in child_events().';
