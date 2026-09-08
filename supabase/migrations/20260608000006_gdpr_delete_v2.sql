-- ============================================================
-- GDPR Account Deletion v2
-- Replaces the original delete_my_account() to anonymize
-- assessment and award data instead of cascade-deleting it.
-- Coach assessments survive with coach_user_id = NULL and
-- coach_name_snapshot preserving attribution.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role::text, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE user_id = v_uid;

  -- ── Coach-specific: anonymize, don't destroy ──────────────
  IF v_role = 'coach' THEN
    -- Snapshot coach name onto assessments before nulling
    UPDATE public.coach_assessments
    SET coach_name_snapshot = COALESCE(coach_name_snapshot, v_name)
    WHERE coach_user_id = v_uid;

    -- Same for recognition awards
    UPDATE public.recognition_awards
    SET coach_name_snapshot = COALESCE(coach_name_snapshot, v_name)
    WHERE coach_user_id = v_uid;

    -- Delete private notes (genuinely personal content)
    DELETE FROM public.coach_assessment_notes
    WHERE coach_user_id = v_uid;

    -- Mark squad players as coach_departed (don't delete them)
    UPDATE public.squad_players
    SET status = 'coach_departed'
    WHERE coach_user_id = v_uid
      AND status = 'active';

    -- Null out the coach FK (SET NULL cascade would do this
    -- automatically, but explicit is clearer for maintenance)
    UPDATE public.coach_assessments
    SET coach_user_id = NULL
    WHERE coach_user_id = v_uid;

    UPDATE public.recognition_awards
    SET coach_user_id = NULL
    WHERE coach_user_id = v_uid;

    UPDATE public.coach_sessions
    SET coach_user_id = NULL
    WHERE coach_user_id = v_uid;

    UPDATE public.squad_players
    SET coach_user_id = NULL
    WHERE coach_user_id = v_uid;

    -- Delete coach-specific profile data
    DELETE FROM public.coach_details WHERE user_id = v_uid;
    DELETE FROM public.staff_compliance WHERE coach_user_id = v_uid;
  END IF;

  -- ── Club admin cleanup ────────────────────────────────────
  IF v_role = 'club' THEN
    DELETE FROM public.admin_notes WHERE admin_user_id = v_uid;
    -- Organization deletion cascades staff_compliance;
    -- coach_details.organization_id goes to NULL (SET NULL FK)
    DELETE FROM public.organizations WHERE admin_user_id = v_uid;
  END IF;

  -- ── Player-specific (unchanged) ───────────────────────────
  DELETE FROM public.matches WHERE user_id = v_uid;
  DELETE FROM public.player_details WHERE user_id = v_uid;
  DELETE FROM public.player_goals WHERE user_id = v_uid;

  -- Remove squad memberships where this user was the player
  -- (these are records other coaches created — delete them)
  DELETE FROM public.squad_players WHERE linked_player_id = v_uid;

  -- ── Parent links (unchanged) ──────────────────────────────
  DELETE FROM public.player_parent_links
    WHERE player_user_id = v_uid OR parent_user_id = v_uid;
  DELETE FROM public.parent_invites WHERE player_user_id = v_uid;

  -- ── Remove profile and auth user ──────────────────────────
  DELETE FROM public.profiles WHERE user_id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;
