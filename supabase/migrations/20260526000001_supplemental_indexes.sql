-- ============================================================
-- Supplemental Performance Indexes
-- Adds the remaining indexes not covered by security_hardening.
-- All indexes use IF NOT EXISTS — safe to re-run.
-- ============================================================

-- coach_assessments: queried by coach_user_id on home + squad pages
CREATE INDEX IF NOT EXISTS idx_coach_assessments_coach_id
  ON public.coach_assessments (coach_user_id);

-- player_goals: queried by user_id on player goals page
CREATE INDEX IF NOT EXISTS idx_player_goals_user_id
  ON public.player_goals (user_id);

-- recognition_awards: queried by coach_user_id and squad_player_id
CREATE INDEX IF NOT EXISTS idx_recognition_awards_coach_id
  ON public.recognition_awards (coach_user_id);

CREATE INDEX IF NOT EXISTS idx_recognition_awards_squad_player_id
  ON public.recognition_awards (squad_player_id);

-- telemetry_events: queried by user_id and created_at for pilot dashboard
-- Wrapped in DO block in case the table doesn't exist in all environments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'telemetry_events'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_telemetry_user_id
      ON public.telemetry_events (user_id);

    CREATE INDEX IF NOT EXISTS idx_telemetry_created_at
      ON public.telemetry_events (created_at DESC);
  END IF;
END $$;
