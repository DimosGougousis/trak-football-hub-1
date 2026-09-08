-- Widen Trak Card stat columns to allow 0..10 (was 1..10)
ALTER TABLE public.coach_assessments
  DROP CONSTRAINT IF EXISTS coach_assessments_consistency_range,
  DROP CONSTRAINT IF EXISTS coach_assessments_impact_range,
  DROP CONSTRAINT IF EXISTS coach_assessments_workrate_range,
  DROP CONSTRAINT IF EXISTS coach_assessments_technique_range,
  DROP CONSTRAINT IF EXISTS coach_assessments_spirit_range;

ALTER TABLE public.coach_assessments
  ADD CONSTRAINT coach_assessments_consistency_range CHECK (consistency BETWEEN 0 AND 10),
  ADD CONSTRAINT coach_assessments_impact_range      CHECK (impact      BETWEEN 0 AND 10),
  ADD CONSTRAINT coach_assessments_workrate_range    CHECK (workrate    BETWEEN 0 AND 10),
  ADD CONSTRAINT coach_assessments_technique_range   CHECK (technique   BETWEEN 0 AND 10),
  ADD CONSTRAINT coach_assessments_spirit_range      CHECK (spirit      BETWEEN 0 AND 10);