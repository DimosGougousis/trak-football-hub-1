-- ============================================================
-- A parent must be able to claim their invitation by email alone
--
-- Found during the first real parent run. The invitation was resent from the
-- Supabase dashboard, which does not carry the custom redirect our edge
-- function sets. So instead of landing on /parent-invite?token=..., the parent
-- landed on the site root: authenticated, confirmed, and with no profile, no
-- role and no link to their child. Dead end, and the child's screen correctly
-- but unhelpfully still read "waiting for your parent".
--
-- The token in the URL was never the right sole key. It breaks whenever a link
-- is resent from the dashboard, forwarded, truncated by a mail client, or
-- opened from a different device. Email is the key that already matters:
-- link_parent_to_players_by_email matches on it, so the invite is already
-- addressed to a person rather than to a URL.
--
-- This exposes that same lookup to a signed-in user for their own address, so
-- the app can recognise an invited parent whatever route they arrived by.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_pending_parent_invite()
RETURNS TABLE(
  invite_id      uuid,
  player_user_id uuid,
  player_name    text,
  parent_email   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  -- Scoped to the caller's own verified address, so this reveals nothing about
  -- invitations addressed to anyone else.
  SELECT pi.id,
         pi.player_user_id,
         p.full_name,
         pi.parent_email
  FROM public.parent_invites pi
  JOIN auth.users u
    ON lower(u.email) = lower(trim(pi.parent_email))
  LEFT JOIN public.profiles p
    ON p.user_id = pi.player_user_id
  WHERE u.id = auth.uid()
    AND pi.status = 'pending'
  ORDER BY pi.created_at DESC
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_pending_parent_invite() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_pending_parent_invite() TO authenticated;

COMMENT ON FUNCTION public.get_my_pending_parent_invite() IS
  'Pending parent invitation addressed to the signed-in user''s own email. Lets an invited parent be recognised without a token in the URL.';
