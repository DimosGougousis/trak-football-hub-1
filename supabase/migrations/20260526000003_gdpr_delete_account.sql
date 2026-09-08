-- ============================================================
-- GDPR Account Deletion RPC
-- Deletes all data for the calling user and removes their
-- auth.users row. SECURITY DEFINER so it can cascade across
-- tables that RLS would otherwise block.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Remove match history
  DELETE FROM public.matches WHERE user_id = v_uid;

  -- Remove player-specific data
  DELETE FROM public.player_details WHERE user_id = v_uid;
  DELETE FROM public.player_goals   WHERE user_id = v_uid;

  -- Remove coach-specific data
  DELETE FROM public.coach_details WHERE user_id = v_uid;

  -- Remove squad memberships (player was linked to a coach's squad)
  DELETE FROM public.squad_players WHERE linked_player_id = v_uid;

  -- Remove parent ↔ player links in both directions
  DELETE FROM public.player_parent_links
    WHERE player_user_id = v_uid OR parent_user_id = v_uid;

  -- Remove pending parent invites sent by this player
  DELETE FROM public.parent_invites WHERE player_user_id = v_uid;

  -- Remove the profile row (triggers Supabase to clean up auth.users)
  DELETE FROM public.profiles WHERE user_id = v_uid;

  -- Delete the auth user record directly
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
