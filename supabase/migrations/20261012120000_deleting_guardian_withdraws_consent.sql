-- TRAK-155 (G6): deleting a guardian account withdraws that guardian's approvals.
--
-- Before, delete_my_account() removed the guardian's links but left their
-- parental_consents rows open, and player_has_parental_consent() reads only
-- those rows. So a child stayed "approved" after the only guardian who
-- approved had deleted their account, the coach could keep recording, and
-- nobody was left to withdraw. Decided 12 Oct (Imad): deletion withdraws, the
-- same way withdraw_parental_consent() does. The rows are closed, not deleted,
-- because they're the evidence of what was authorised (no account FKs, by
-- design). Another guardian's approval is untouched.
--
-- Same function as 20260901000008 otherwise.

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

  -- ── Guardian approvals (TRAK-155) ─────────────────────────
  -- Closed, not deleted: withdrawal never undoes lawful past processing, and
  -- the row is the evidence. Exactly what withdraw_parental_consent() does.
  UPDATE public.parental_consents
     SET withdrawn_at = now()
   WHERE parent_user_id = v_uid
     AND withdrawn_at IS NULL;

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
