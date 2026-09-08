-- ============================================================
-- Assessment Data Continuity
-- Ensures assessments, awards, sessions, and squad records
-- survive coach departure or account deletion. Adds name
-- snapshots for attribution and org_id for scoped access.
-- ============================================================

-- ── coach_assessments ───────────────────────────────────────

-- Snapshot of coach name at time of assessment (survives account deletion)
ALTER TABLE public.coach_assessments
  ADD COLUMN IF NOT EXISTS coach_name_snapshot TEXT;

-- Link assessments to the academy for org-scoped admin queries
ALTER TABLE public.coach_assessments
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coach_assessments_org
  ON public.coach_assessments (organization_id)
  WHERE organization_id IS NOT NULL;

-- ── recognition_awards ──────────────────────────────────────

ALTER TABLE public.recognition_awards
  ADD COLUMN IF NOT EXISTS coach_name_snapshot TEXT;

ALTER TABLE public.recognition_awards
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ── squad_players — add status tracking ─────────────────────

ALTER TABLE public.squad_players
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.squad_players
  DROP CONSTRAINT IF EXISTS squad_players_status_valid;

ALTER TABLE public.squad_players
  ADD CONSTRAINT squad_players_status_valid
  CHECK (status IN ('active', 'coach_departed', 'released', 'archived'));

CREATE INDEX IF NOT EXISTS idx_squad_players_status
  ON public.squad_players (status)
  WHERE status != 'active';

-- ── FK changes: SET NULL instead of CASCADE ─────────────────
-- Assessments, awards, sessions, and squad records must survive
-- coach account deletion. The coach_user_id becomes NULL and
-- coach_name_snapshot preserves attribution.

-- squad_players
ALTER TABLE public.squad_players
  DROP CONSTRAINT IF EXISTS squad_players_coach_user_id_fkey;
ALTER TABLE public.squad_players
  ADD CONSTRAINT squad_players_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make coach_user_id nullable (was NOT NULL)
ALTER TABLE public.squad_players
  ALTER COLUMN coach_user_id DROP NOT NULL;

-- recognition_awards
ALTER TABLE public.recognition_awards
  DROP CONSTRAINT IF EXISTS recognition_awards_coach_user_id_fkey;
ALTER TABLE public.recognition_awards
  ADD CONSTRAINT recognition_awards_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.recognition_awards
  ALTER COLUMN coach_user_id DROP NOT NULL;

-- coach_sessions
ALTER TABLE public.coach_sessions
  DROP CONSTRAINT IF EXISTS coach_sessions_coach_user_id_fkey;
ALTER TABLE public.coach_sessions
  ADD CONSTRAINT coach_sessions_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.coach_sessions
  ALTER COLUMN coach_user_id DROP NOT NULL;

-- coach_assessments: coach_user_id has no FK currently, just add one
ALTER TABLE public.coach_assessments
  ALTER COLUMN coach_user_id DROP NOT NULL;

ALTER TABLE public.coach_assessments
  DROP CONSTRAINT IF EXISTS coach_assessments_coach_user_id_fkey;
ALTER TABLE public.coach_assessments
  ADD CONSTRAINT coach_assessments_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Auto-set organization_id on new assessments ─────────────

CREATE OR REPLACE FUNCTION public.set_assessment_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.coach_user_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.coach_details
    WHERE user_id = NEW.coach_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_assessment_org ON public.coach_assessments;
CREATE TRIGGER trg_set_assessment_org
  BEFORE INSERT ON public.coach_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_assessment_org_id();

-- Same for recognition_awards
CREATE OR REPLACE FUNCTION public.set_award_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.coach_user_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.coach_details
    WHERE user_id = NEW.coach_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_award_org ON public.recognition_awards;
CREATE TRIGGER trg_set_award_org
  BEFORE INSERT ON public.recognition_awards
  FOR EACH ROW EXECUTE FUNCTION public.set_award_org_id();

-- ── Backfill org_id on existing assessments ─────────────────

UPDATE public.coach_assessments ca
SET organization_id = cd.organization_id
FROM public.coach_details cd
WHERE ca.coach_user_id = cd.user_id
  AND cd.organization_id IS NOT NULL
  AND ca.organization_id IS NULL;

UPDATE public.recognition_awards ra
SET organization_id = cd.organization_id
FROM public.coach_details cd
WHERE ra.coach_user_id = cd.user_id
  AND cd.organization_id IS NOT NULL
  AND ra.organization_id IS NULL;
