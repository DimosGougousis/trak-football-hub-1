-- Add 5 new Trak Card stat columns to coach_assessments
-- These map to the player Evolution Card: Consistency, Impact, Workrate, Technique, Spirit
ALTER TABLE public.coach_assessments
  ADD COLUMN IF NOT EXISTS consistency integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS impact integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS workrate integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS technique integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS spirit integer NOT NULL DEFAULT 5;

-- Add a sanity check (1-10 range) for each new stat
ALTER TABLE public.coach_assessments
  ADD CONSTRAINT coach_assessments_consistency_range CHECK (consistency BETWEEN 1 AND 10),
  ADD CONSTRAINT coach_assessments_impact_range      CHECK (impact      BETWEEN 1 AND 10),
  ADD CONSTRAINT coach_assessments_workrate_range    CHECK (workrate    BETWEEN 1 AND 10),
  ADD CONSTRAINT coach_assessments_technique_range   CHECK (technique   BETWEEN 1 AND 10),
  ADD CONSTRAINT coach_assessments_spirit_range      CHECK (spirit      BETWEEN 1 AND 10);