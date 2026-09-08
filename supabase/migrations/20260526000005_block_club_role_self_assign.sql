-- ============================================================
-- Block self-assignment of 'club' admin role
-- Users should not be able to give themselves club admin access
-- during profile creation. Club role is assigned by platform admin only.
-- ============================================================

-- Drop existing profile insert policy if it allows any role
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;

-- Re-create insert policy blocking club role self-assignment
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role != 'club'
  );
