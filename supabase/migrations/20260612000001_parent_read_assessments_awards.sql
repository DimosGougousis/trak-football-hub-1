-- ============================================================
-- Parents: read child's coach assessments + recognition awards
--
-- ParentHome.tsx and ParentAlerts.tsx already query coach_assessments
-- and recognition_awards, and the UI to render them exists — but no
-- parent SELECT policy was ever added, so both queries returned 0 rows
-- and the sections silently never appeared.
--
-- Parents already have policies for matches, squad_players, profiles
-- and player_details. This closes the remaining two.
--
-- Uses a SECURITY DEFINER helper (same pattern as coach_in_my_org /
-- squad_player_in_my_org in 20260609000001) so the membership check
-- bypasses RLS on squad_players and player_parent_links and cannot
-- reintroduce the recursion bug.
--
-- Deliberately NOT granted: coach_assessment_notes. The coach's private
-- note is between coach and player only.
-- ============================================================

-- Helper: is this squad_player row one of the caller's linked children?
CREATE OR REPLACE FUNCTION public.squad_player_is_my_child(p_squad_player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.squad_players sp
    JOIN public.player_parent_links ppl
      ON ppl.player_user_id = sp.linked_player_id
    WHERE sp.id = p_squad_player_id
      AND sp.linked_player_id IS NOT NULL
      AND ppl.parent_user_id = auth.uid()
  );
$fn$;

REVOKE ALL ON FUNCTION public.squad_player_is_my_child(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.squad_player_is_my_child(uuid) TO authenticated;

-- coach_assessments
DROP POLICY IF EXISTS "Parents read child assessments" ON public.coach_assessments;
CREATE POLICY "Parents read child assessments"
  ON public.coach_assessments FOR SELECT TO authenticated
  USING (
    public.squad_player_is_my_child(coach_assessments.squad_player_id)
  );

-- recognition_awards
DROP POLICY IF EXISTS "Parents read child awards" ON public.recognition_awards;
CREATE POLICY "Parents read child awards"
  ON public.recognition_awards FOR SELECT TO authenticated
  USING (
    public.squad_player_is_my_child(recognition_awards.squad_player_id)
  );
