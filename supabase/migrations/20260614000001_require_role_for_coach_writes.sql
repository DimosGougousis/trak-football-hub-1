-- ============================================================
-- SECURITY: writes to coach-owned tables never checked the writer's role
--
-- Every write policy on these tables was of the form
--     WITH CHECK (coach_user_id = auth.uid())
-- which asks "are you claiming to be yourself?" but never "are you a
-- coach?". Any authenticated user could therefore set the owner column to
-- their own id and pass the check.
--
-- Confirmed against the live database, signed in as an ordinary player:
--   * inserted a coach_assessment about themselves with 10/10 in every
--     category — which feeds their band, Evolution Card, passport, the
--     parent view and the club dashboard
--   * awarded themselves Player of the Week
--   * inserted coach_sessions, coach_calendar_events and squad_players
--   * created an organization with themselves as admin_user_id
--
-- coach_assessments and recognition_awards have deliberate "no deletion"
-- policies so records stay trustworthy. Combined with this flaw that made
-- fabricated rows permanent — they could not be removed through the app.
--
-- Reading was never affected: cross-tenant read isolation was verified
-- clean for player, coach, parent and anonymous access.
--
-- Fix: require the writer to actually hold the role, via SECURITY DEFINER
-- helpers (same pattern as is_club_admin()) so the check cannot recurse
-- through profiles' own RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'coach'
  );
$fn$;

REVOKE ALL ON FUNCTION public.is_coach() FROM public;
GRANT EXECUTE ON FUNCTION public.is_coach() TO authenticated;


-- ── coach_assessments ───────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can insert assessments" ON public.coach_assessments;
CREATE POLICY "Coaches can insert assessments"
  ON public.coach_assessments FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

DROP POLICY IF EXISTS "Coaches can update own assessments" ON public.coach_assessments;
CREATE POLICY "Coaches can update own assessments"
  ON public.coach_assessments FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid() AND public.is_coach())
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

-- ── recognition_awards ──────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can insert awards" ON public.recognition_awards;
CREATE POLICY "Coaches can insert awards"
  ON public.recognition_awards FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

DROP POLICY IF EXISTS "Coaches can update own awards" ON public.recognition_awards;
CREATE POLICY "Coaches can update own awards"
  ON public.recognition_awards FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid() AND public.is_coach())
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

-- ── squad_players ───────────────────────────────────────────
-- NOTE: link_player_to_coach() inserts here for a player joining by code.
-- It is SECURITY DEFINER, so it bypasses RLS and is unaffected.
DROP POLICY IF EXISTS "Coaches can insert squad players" ON public.squad_players;
CREATE POLICY "Coaches can insert squad players"
  ON public.squad_players FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

DROP POLICY IF EXISTS "Coaches can update own squad players" ON public.squad_players;
CREATE POLICY "Coaches can update own squad players"
  ON public.squad_players FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid() AND public.is_coach())
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

-- ── coach_sessions ──────────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can insert sessions" ON public.coach_sessions;
CREATE POLICY "Coaches can insert sessions"
  ON public.coach_sessions FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

DROP POLICY IF EXISTS "Coaches can update own sessions" ON public.coach_sessions;
CREATE POLICY "Coaches can update own sessions"
  ON public.coach_sessions FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid() AND public.is_coach())
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

-- ── coach_calendar_events ───────────────────────────────────
DROP POLICY IF EXISTS "Coaches can insert events" ON public.coach_calendar_events;
CREATE POLICY "Coaches can insert events"
  ON public.coach_calendar_events FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

DROP POLICY IF EXISTS "Coaches can update own events" ON public.coach_calendar_events;
CREATE POLICY "Coaches can update own events"
  ON public.coach_calendar_events FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid() AND public.is_coach())
  WITH CHECK (coach_user_id = auth.uid() AND public.is_coach());

-- ── organizations ───────────────────────────────────────────
-- Only a club admin may create or edit an academy.
DROP POLICY IF EXISTS "Admin can insert own org" ON public.organizations;
CREATE POLICY "Admin can insert own org"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (admin_user_id = auth.uid() AND public.is_club_admin());

DROP POLICY IF EXISTS "Admin can update own org" ON public.organizations;
CREATE POLICY "Admin can update own org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid() AND public.is_club_admin())
  WITH CHECK (admin_user_id = auth.uid() AND public.is_club_admin());


-- ── Narrow get_profile_role to the caller ───────────────────
-- It accepted an arbitrary user id with no caller check, so any signed-in
-- user could read anyone's role. It must NOT be dropped: the "Users can
-- update own profile" policy calls it to pin role to its current value,
-- and that is what prevents a user promoting themselves to coach.
-- The only caller passes auth.uid(), so restricting it to the caller keeps
-- that policy working while removing the arbitrary lookup.
CREATE OR REPLACE FUNCTION public.get_profile_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p.role
  FROM public.profiles p
  WHERE p.user_id = _user_id
    AND _user_id = auth.uid()
  LIMIT 1;
$fn$;
