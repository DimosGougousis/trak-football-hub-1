
-- ============================================================================
-- 1. PRIVATE NOTES — move private_note to a coach-only table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_assessment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL UNIQUE REFERENCES public.coach_assessments(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_assessment_notes ENABLE ROW LEVEL SECURITY;

-- Coach can read/write their own notes only. Players & parents have NO access.
CREATE POLICY "Coaches manage own assessment notes"
  ON public.coach_assessment_notes
  FOR ALL TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

-- Migrate existing notes
INSERT INTO public.coach_assessment_notes (assessment_id, coach_user_id, note, created_at)
SELECT id, coach_user_id, private_note, COALESCE(created_at, now())
FROM public.coach_assessments
WHERE private_note IS NOT NULL AND private_note <> ''
ON CONFLICT (assessment_id) DO NOTHING;

-- Drop the column from the public assessments table — players will no longer see it
ALTER TABLE public.coach_assessments DROP COLUMN IF EXISTS private_note;


-- ============================================================================
-- 2. COACH INVITE-CODE LOOKUP — replace public policy with secure RPC
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can look up coach by invite code" ON public.profiles;

CREATE OR REPLACE FUNCTION public.get_coach_id_by_invite_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.profiles
  WHERE role = 'coach'
    AND invite_code IS NOT NULL
    AND upper(invite_code) = upper(p_code)
  LIMIT 1;
$$;


-- ============================================================================
-- 3. PARENT-PLAYER LINK FORGERY — require matching pending invite
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated can insert links" ON public.player_parent_links;

CREATE POLICY "Parents can insert validated links"
  ON public.player_parent_links
  FOR INSERT TO authenticated
  WITH CHECK (
    parent_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.parent_invites pi
      WHERE pi.player_user_id = player_parent_links.player_user_id
        AND pi.status = 'pending'
    )
  );

-- Allow parent_invites to be marked 'accepted' once a link is created.
-- We add an UPDATE policy that lets the matching parent flip status to 'accepted'.
CREATE POLICY "Parents can accept own pending invite"
  ON public.parent_invites
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.player_parent_links ppl
      WHERE ppl.player_user_id = parent_invites.player_user_id
        AND ppl.parent_user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('accepted', 'pending')
  );
