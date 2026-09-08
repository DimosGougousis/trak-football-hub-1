-- ============================================================
-- Fix RLS infinite recursion on squad_players
-- The admin SELECT policy on squad_players references coach_details,
-- and the admin SELECT policy on profiles references squad_players,
-- creating a circular dependency. Fix by using SECURITY DEFINER
-- helper functions that bypass RLS for the org membership checks.
-- ============================================================

-- Helper: check if a coach belongs to the caller's org (bypasses RLS)
CREATE OR REPLACE FUNCTION public.coach_in_my_org(p_coach_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_details cd
    JOIN public.organizations o ON o.id = cd.organization_id
    WHERE cd.user_id = p_coach_user_id
      AND o.admin_user_id = auth.uid()
  );
$fn$;

-- Helper: check if a player is linked to any coach in the caller's org
CREATE OR REPLACE FUNCTION public.player_in_my_org(p_player_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.squad_players sp
    JOIN public.coach_details cd ON cd.user_id = sp.coach_user_id
    JOIN public.organizations o ON o.id = cd.organization_id
    WHERE sp.linked_player_id = p_player_user_id
      AND o.admin_user_id = auth.uid()
  );
$fn$;

-- Helper: check if a squad_player row belongs to the caller's org
CREATE OR REPLACE FUNCTION public.squad_player_in_my_org(p_squad_player_id uuid, p_coach_user_id uuid, p_status text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT (
    -- Active coach in the org
    (p_coach_user_id IS NOT NULL AND public.coach_in_my_org(p_coach_user_id))
    -- Or departed coach with org-tagged assessments
    OR (
      p_status = 'coach_departed'
      AND EXISTS (
        SELECT 1 FROM public.coach_assessments ca
        JOIN public.organizations o ON o.id = ca.organization_id
        WHERE ca.squad_player_id = p_squad_player_id
          AND o.admin_user_id = auth.uid()
      )
    )
  );
$fn$;

-- ── Replace the problematic policies ────────────────────────────

-- squad_players
DROP POLICY IF EXISTS "Club admins read org squad players" ON public.squad_players;
CREATE POLICY "Club admins read org squad players"
  ON public.squad_players FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND public.squad_player_in_my_org(id, coach_user_id, status)
  );

-- profiles
DROP POLICY IF EXISTS "Club admins read org profiles" ON public.profiles;
CREATE POLICY "Club admins read org profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND (
      profiles.user_id = auth.uid()
      OR public.coach_in_my_org(profiles.user_id)
      OR public.player_in_my_org(profiles.user_id)
    )
  );

-- player_details
DROP POLICY IF EXISTS "Club admins read org player details" ON public.player_details;
CREATE POLICY "Club admins read org player details"
  ON public.player_details FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND public.player_in_my_org(player_details.user_id)
  );

-- coach_sessions
DROP POLICY IF EXISTS "Club admins read org coach sessions" ON public.coach_sessions;
CREATE POLICY "Club admins read org coach sessions"
  ON public.coach_sessions FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND public.coach_in_my_org(coach_sessions.coach_user_id)
  );
