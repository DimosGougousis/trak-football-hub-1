-- Actually drop player_goals, and stop delete_my_account referencing it.
--
-- 20260615000001 claimed to drop this table and features-outstanding.md records
-- it as done — but it was never applied to production. The table was still
-- there, holding 6 rows of goal data for a test account, undeclared and
-- unreachable: the goals feature was removed from the app, so nothing reads or
-- writes it.
--
-- The two statements MUST travel together. delete_my_account() contains
-- `DELETE FROM public.player_goals`, so dropping the table on its own would
-- make every account deletion throw — breaking the GDPR erasure path at
-- exactly the moment the pilot starts relying on it. That the deletion test
-- passed at all was luck: it only worked because the drop had never happened.

DROP TABLE IF EXISTS public.player_goals;

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
  FROM public.profiles WHERE user_id = v_uid;

  -- ── Coach: anonymise rather than destroy ──────────────────
  -- A coach leaving must not erase the assessment history of the
  -- children they coached; the name is snapshotted first.
  IF v_role = 'coach' THEN
    UPDATE public.coach_assessments
      SET coach_name_snapshot = COALESCE(coach_name_snapshot, v_name)
      WHERE coach_user_id = v_uid;
    UPDATE public.recognition_awards
      SET coach_name_snapshot = COALESCE(coach_name_snapshot, v_name)
      WHERE coach_user_id = v_uid;

    DELETE FROM public.coach_assessment_notes WHERE coach_user_id = v_uid;

    UPDATE public.squad_players SET status = 'coach_departed'
      WHERE coach_user_id = v_uid AND status = 'active';

    UPDATE public.coach_assessments SET coach_user_id = NULL WHERE coach_user_id = v_uid;
    UPDATE public.recognition_awards SET coach_user_id = NULL WHERE coach_user_id = v_uid;
    UPDATE public.coach_sessions    SET coach_user_id = NULL WHERE coach_user_id = v_uid;
    UPDATE public.squad_players     SET coach_user_id = NULL WHERE coach_user_id = v_uid;

    DELETE FROM public.coach_details    WHERE user_id = v_uid;
    DELETE FROM public.staff_compliance WHERE coach_user_id = v_uid;
  END IF;

  -- ── Club admin ────────────────────────────────────────────
  IF v_role = 'club' THEN
    DELETE FROM public.admin_notes   WHERE admin_user_id = v_uid;
    DELETE FROM public.organizations WHERE admin_user_id = v_uid;
  END IF;

  -- ── Player ────────────────────────────────────────────────
  DELETE FROM public.matches        WHERE user_id = v_uid;
  DELETE FROM public.player_details WHERE user_id = v_uid;
  -- player_goals intentionally absent: the table no longer exists.
  DELETE FROM public.squad_players  WHERE linked_player_id = v_uid;

  -- ── Parent links ──────────────────────────────────────────
  DELETE FROM public.player_parent_links
    WHERE player_user_id = v_uid OR parent_user_id = v_uid;
  DELETE FROM public.parent_invites WHERE player_user_id = v_uid;

  -- ── Profile and auth user ─────────────────────────────────
  -- telemetry_events needs no statement: its user_id carries
  -- ON DELETE CASCADE against auth.users.
  DELETE FROM public.profiles WHERE user_id = v_uid;
  DELETE FROM auth.users      WHERE id = v_uid;
END;
$$;
