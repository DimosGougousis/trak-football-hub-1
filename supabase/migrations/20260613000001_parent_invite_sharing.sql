-- ============================================================
-- Parent invites: let the player actually deliver the invite
--
-- The invite row and its invite_token were already created correctly at
-- signup, and /parent-invite?token=... already resolves them via
-- get_parent_invite_by_token. What was missing was any way to GET the
-- token to the parent:
--   * no edge function sends an email, and
--   * get_player_invites_for_current_user did not return invite_token,
--     so the player could not copy a link either.
-- In practice a parent was only ever linked if they happened to sign up
-- with the exact invited address.
--
-- This adds the two pieces the player side needs. Delivery stays manual
-- (the player shares a link over whatever messenger they already use),
-- which avoids taking on an email provider, its cost, deliverability and
-- the extra personal data an automated mail-out would involve.
--
-- Direct table access is deliberately still closed: the SELECT policy was
-- replaced by a SECURITY DEFINER function in 20260424182041 and stays that
-- way. These functions follow the same pattern.
-- ============================================================

-- 1. Return invite_token so the player can build a share link.
--    Return type changes, so the old function must be dropped first.
DROP FUNCTION IF EXISTS public.get_player_invites_for_current_user();

CREATE FUNCTION public.get_player_invites_for_current_user()
RETURNS TABLE(
  id uuid,
  player_user_id uuid,
  parent_email text,
  invite_token uuid,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT pi.id, pi.player_user_id, pi.parent_email, pi.invite_token, pi.status, pi.created_at
  FROM public.parent_invites pi
  WHERE pi.player_user_id = auth.uid()
  ORDER BY pi.created_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.get_player_invites_for_current_user() FROM public;
GRANT EXECUTE ON FUNCTION public.get_player_invites_for_current_user() TO authenticated;


-- 2. Create an invite (or return the existing one) and hand back the token.
--    A plain INSERT ... RETURNING from the client fails, because RETURNING
--    needs a SELECT policy and that policy was intentionally removed.
CREATE OR REPLACE FUNCTION public.create_parent_invite(p_email text)
RETURNS TABLE(
  id uuid,
  parent_email text,
  invite_token uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  -- Idempotent: re-inviting the same address returns the existing invite
  -- rather than issuing a second token that would invalidate the first.
  RETURN QUERY
  SELECT pi.id, pi.parent_email, pi.invite_token, pi.status
  FROM public.parent_invites pi
  WHERE pi.player_user_id = v_uid AND lower(pi.parent_email) = v_email;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.parent_invites (player_user_id, parent_email)
    VALUES (v_uid, v_email)
    RETURNING parent_invites.id            AS new_id,
              parent_invites.parent_email  AS new_email,
              parent_invites.invite_token  AS new_token,
              parent_invites.status        AS new_status
  )
  SELECT ins.new_id, ins.new_email, ins.new_token, ins.new_status FROM ins;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_parent_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_parent_invite(text) TO authenticated;
