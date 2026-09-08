-- ============================================================
-- Organization-Scoped RLS for Club Admins
-- Replaces the existing club admin policies (which see ALL data
-- in the system) with org-scoped policies. Admins now only see
-- coaches, players, and assessments within their own academy.
-- ============================================================

-- ── coach_details: only coaches in admin's org ──────────────

DROP POLICY IF EXISTS "Club admins read coach details" ON public.coach_details;
CREATE POLICY "Club admins read org coach details"
  ON public.coach_details FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND organization_id = public.my_organization_id()
  );

-- ── profiles: only coaches/players linked to admin's org ────
-- Admin needs to read profiles of coaches in their org, plus
-- profiles of players linked to those coaches via squad_players.

DROP POLICY IF EXISTS "Club admins read all profiles" ON public.profiles;
CREATE POLICY "Club admins read org profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND (
      -- Coach profiles in the org
      EXISTS (
        SELECT 1 FROM public.coach_details cd
        WHERE cd.user_id = profiles.user_id
          AND cd.organization_id = public.my_organization_id()
      )
      -- Player profiles linked to org coaches
      OR EXISTS (
        SELECT 1 FROM public.squad_players sp
        JOIN public.coach_details cd ON cd.user_id = sp.coach_user_id
        WHERE sp.linked_player_id = profiles.user_id
          AND cd.organization_id = public.my_organization_id()
      )
      -- Admin's own profile
      OR profiles.user_id = auth.uid()
    )
  );

-- ── player_details: only players linked to org coaches ──────

DROP POLICY IF EXISTS "Club admins read player details" ON public.player_details;
CREATE POLICY "Club admins read org player details"
  ON public.player_details FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND EXISTS (
      SELECT 1 FROM public.squad_players sp
      JOIN public.coach_details cd ON cd.user_id = sp.coach_user_id
      WHERE sp.linked_player_id = player_details.user_id
        AND cd.organization_id = public.my_organization_id()
    )
  );

-- ── squad_players: only those belonging to org coaches ───────
-- Also includes coach_departed players whose assessments are
-- tagged to this org (for historical continuity).

DROP POLICY IF EXISTS "Club admins read squad players" ON public.squad_players;
CREATE POLICY "Club admins read org squad players"
  ON public.squad_players FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND (
      -- Active coaches in the org
      EXISTS (
        SELECT 1 FROM public.coach_details cd
        WHERE cd.user_id = squad_players.coach_user_id
          AND cd.organization_id = public.my_organization_id()
      )
      -- Departed coach players with org-tagged assessments
      OR (
        squad_players.status = 'coach_departed'
        AND EXISTS (
          SELECT 1 FROM public.coach_assessments ca
          WHERE ca.squad_player_id = squad_players.id
            AND ca.organization_id = public.my_organization_id()
        )
      )
    )
  );

-- ── coach_assessments: only those tagged to admin's org ──────

DROP POLICY IF EXISTS "Club admins read coach assessments" ON public.coach_assessments;
CREATE POLICY "Club admins read org assessments"
  ON public.coach_assessments FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND organization_id = public.my_organization_id()
  );

-- ── coach_sessions: only sessions from org coaches ──────────

DROP POLICY IF EXISTS "Club admins read coach sessions" ON public.coach_sessions;
CREATE POLICY "Club admins read org coach sessions"
  ON public.coach_sessions FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND EXISTS (
      SELECT 1 FROM public.coach_details cd
      WHERE cd.user_id = coach_sessions.coach_user_id
        AND cd.organization_id = public.my_organization_id()
    )
  );

-- ── recognition_awards: only those tagged to admin's org ────

DROP POLICY IF EXISTS "Club admins read recognition awards" ON public.recognition_awards;
CREATE POLICY "Club admins read org recognition awards"
  ON public.recognition_awards FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    AND organization_id = public.my_organization_id()
  );

-- ── RLS policies for coach reads of orphaned records ────────
-- After a coach deletes their account, assessments and awards
-- have coach_user_id = NULL. Players who were assessed should
-- still be able to read these records.

CREATE POLICY "Players read orphaned assessments"
  ON public.coach_assessments FOR SELECT TO authenticated
  USING (
    coach_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.squad_players sp
      WHERE sp.id = coach_assessments.squad_player_id
        AND sp.linked_player_id = auth.uid()
    )
  );

CREATE POLICY "Players read orphaned awards"
  ON public.recognition_awards FOR SELECT TO authenticated
  USING (
    coach_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.squad_players sp
      WHERE sp.id = recognition_awards.squad_player_id
        AND sp.linked_player_id = auth.uid()
    )
  );
