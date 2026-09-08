-- ============================================================
-- RLS Explicit Operations Hardening
-- Replaces broad FOR ALL policies with explicit SELECT/INSERT/UPDATE
-- and blocks DELETE on immutable records (assessments, match history,
-- awards). Safe to re-run — all drops use IF EXISTS.
-- ============================================================

-- ── coach_assessments ────────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can manage own assessments" ON public.coach_assessments;

CREATE POLICY "Coaches can select own assessments"
  ON public.coach_assessments FOR SELECT TO authenticated
  USING (coach_user_id = auth.uid());

CREATE POLICY "Coaches can insert assessments"
  ON public.coach_assessments FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can update own assessments"
  ON public.coach_assessments FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

-- Assessment history is permanent — no deletions allowed
CREATE POLICY "No assessment deletion"
  ON public.coach_assessments FOR DELETE TO authenticated
  USING (false);

-- ── coach_assessment_notes ───────────────────────────────────
DROP POLICY IF EXISTS "Coaches manage own assessment notes" ON public.coach_assessment_notes;

CREATE POLICY "Coaches can select own assessment notes"
  ON public.coach_assessment_notes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_assessments ca
      WHERE ca.id = assessment_id AND ca.coach_user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert assessment notes"
  ON public.coach_assessment_notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coach_assessments ca
      WHERE ca.id = assessment_id AND ca.coach_user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update own assessment notes"
  ON public.coach_assessment_notes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_assessments ca
      WHERE ca.id = assessment_id AND ca.coach_user_id = auth.uid()
    )
  );

-- Notes are permanent like assessments
CREATE POLICY "No assessment note deletion"
  ON public.coach_assessment_notes FOR DELETE TO authenticated
  USING (false);

-- ── recognition_awards ───────────────────────────────────────
DROP POLICY IF EXISTS "Coaches manage own awards" ON public.recognition_awards;

CREATE POLICY "Coaches can select own awards"
  ON public.recognition_awards FOR SELECT TO authenticated
  USING (coach_user_id = auth.uid());

CREATE POLICY "Coaches can insert awards"
  ON public.recognition_awards FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can update own awards"
  ON public.recognition_awards FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

-- Awards are a permanent record — no deletions
CREATE POLICY "No award deletion"
  ON public.recognition_awards FOR DELETE TO authenticated
  USING (false);

-- ── squad_players ────────────────────────────────────────────
-- Coaches legitimately need to remove players from their squad,
-- so DELETE is preserved. Only split SELECT/INSERT/UPDATE/DELETE
-- to be explicit.
DROP POLICY IF EXISTS "Coaches can manage own squad" ON public.squad_players;

CREATE POLICY "Coaches can select own squad"
  ON public.squad_players FOR SELECT TO authenticated
  USING (coach_user_id = auth.uid());

CREATE POLICY "Coaches can insert squad players"
  ON public.squad_players FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can update own squad players"
  ON public.squad_players FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can delete own squad players"
  ON public.squad_players FOR DELETE TO authenticated
  USING (coach_user_id = auth.uid());

-- ── coach_sessions ───────────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can manage own sessions" ON public.coach_sessions;

CREATE POLICY "Coaches can select own sessions"
  ON public.coach_sessions FOR SELECT TO authenticated
  USING (coach_user_id = auth.uid());

CREATE POLICY "Coaches can insert sessions"
  ON public.coach_sessions FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can update own sessions"
  ON public.coach_sessions FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can delete own sessions"
  ON public.coach_sessions FOR DELETE TO authenticated
  USING (coach_user_id = auth.uid());

-- ── session_attendance ───────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can manage attendance via session ownership" ON public.session_attendance;

CREATE POLICY "Coaches can select attendance for own sessions"
  ON public.session_attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = session_id AND cs.coach_user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert attendance for own sessions"
  ON public.session_attendance FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = session_id AND cs.coach_user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update attendance for own sessions"
  ON public.session_attendance FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = session_id AND cs.coach_user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete attendance for own sessions"
  ON public.session_attendance FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = session_id AND cs.coach_user_id = auth.uid()
    )
  );

-- ── coach_calendar_events ────────────────────────────────────
DROP POLICY IF EXISTS "Coaches manage own events" ON public.coach_calendar_events;

CREATE POLICY "Coaches can select own events"
  ON public.coach_calendar_events FOR SELECT TO authenticated
  USING (coach_user_id = auth.uid());

CREATE POLICY "Coaches can insert events"
  ON public.coach_calendar_events FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can update own events"
  ON public.coach_calendar_events FOR UPDATE TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Coaches can delete own events"
  ON public.coach_calendar_events FOR DELETE TO authenticated
  USING (coach_user_id = auth.uid());

-- ── player_goals ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Players can manage own goals" ON public.player_goals;

CREATE POLICY "Players can select own goals"
  ON public.player_goals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Players can insert own goals"
  ON public.player_goals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Players can update own goals"
  ON public.player_goals FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Players can delete own goals"
  ON public.player_goals FOR DELETE TO authenticated
  USING (user_id = auth.uid());
