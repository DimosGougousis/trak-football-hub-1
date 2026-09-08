DROP POLICY IF EXISTS "Parents can read own invites by email" ON public.parent_invites;
DROP POLICY IF EXISTS "Parents can accept own pending invite" ON public.parent_invites;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.get_parent_pending_invites_for_current_user()
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
  WHERE pi.status = 'pending'
    AND lower(pi.parent_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

CREATE POLICY "Parents can accept own pending invite"
  ON public.parent_invites
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND lower(parent_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    status IN ('accepted', 'pending')
    AND lower(parent_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

CREATE OR REPLACE FUNCTION public.get_profile_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.user_id = _user_id
  LIMIT 1;
$$;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = public.get_profile_role(auth.uid())
  );