DROP POLICY IF EXISTS "Players can read own invites" ON public.parent_invites;

CREATE OR REPLACE FUNCTION public.get_player_invites_for_current_user()
RETURNS TABLE(
  id uuid,
  player_user_id uuid,
  parent_email text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pi.id, pi.player_user_id, pi.parent_email, pi.status, pi.created_at
  FROM public.parent_invites pi
  WHERE pi.player_user_id = auth.uid();
$$;