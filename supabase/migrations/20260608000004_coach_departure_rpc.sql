-- ============================================================
-- Coach Departure RPC
-- Called by admin to remove a coach from their academy.
-- The coach's Trak account is unaffected — they just lose the
-- org association. Assessment data stays with the academy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_coach_from_org(p_coach_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NOT public.is_club_admin() THEN
    RAISE EXCEPTION 'Not authorized — must be a club admin';
  END IF;

  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE admin_user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for this admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coach_details
    WHERE user_id = p_coach_user_id
      AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Coach does not belong to your organization';
  END IF;

  -- Unlink coach from the organization
  UPDATE public.coach_details
  SET organization_id = NULL
  WHERE user_id = p_coach_user_id;

  -- Mark their active squad players as coach_departed
  UPDATE public.squad_players
  SET status = 'coach_departed'
  WHERE coach_user_id = p_coach_user_id
    AND status = 'active';

  -- Remove their compliance record from this org
  DELETE FROM public.staff_compliance
  WHERE coach_user_id = p_coach_user_id
    AND organization_id = v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_coach_from_org(UUID) TO authenticated;
