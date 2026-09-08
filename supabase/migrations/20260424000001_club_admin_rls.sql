-- ============================================================
-- Club / Academy Administrator RLS Policies
-- Role = 'club' in profiles table
-- Admins get read-only access across all coaches and players
-- ============================================================

-- Helper: check if current user is a club admin
CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'club'
  );
$$;

-- profiles: club admin can read all profiles
DROP POLICY IF EXISTS "Club admins read all profiles" ON public.profiles;
CREATE POLICY "Club admins read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_club_admin());

-- coach_details: club admin can read all
DROP POLICY IF EXISTS "Club admins read coach details" ON public.coach_details;
CREATE POLICY "Club admins read coach details"
  ON public.coach_details FOR SELECT TO authenticated
  USING (public.is_club_admin());

-- player_details: club admin can read all
DROP POLICY IF EXISTS "Club admins read player details" ON public.player_details;
CREATE POLICY "Club admins read player details"
  ON public.player_details FOR SELECT TO authenticated
  USING (public.is_club_admin());

-- squad_players: club admin can read all
DROP POLICY IF EXISTS "Club admins read squad players" ON public.squad_players;
CREATE POLICY "Club admins read squad players"
  ON public.squad_players FOR SELECT TO authenticated
  USING (public.is_club_admin());

-- coach_assessments: club admin can read all
DROP POLICY IF EXISTS "Club admins read coach assessments" ON public.coach_assessments;
CREATE POLICY "Club admins read coach assessments"
  ON public.coach_assessments FOR SELECT TO authenticated
  USING (public.is_club_admin());

-- coach_sessions: club admin can read all
DROP POLICY IF EXISTS "Club admins read coach sessions" ON public.coach_sessions;
CREATE POLICY "Club admins read coach sessions"
  ON public.coach_sessions FOR SELECT TO authenticated
  USING (public.is_club_admin());

-- recognition_awards: club admin can read all
DROP POLICY IF EXISTS "Club admins read recognition awards" ON public.recognition_awards;
CREATE POLICY "Club admins read recognition awards"
  ON public.recognition_awards FOR SELECT TO authenticated
  USING (public.is_club_admin());
