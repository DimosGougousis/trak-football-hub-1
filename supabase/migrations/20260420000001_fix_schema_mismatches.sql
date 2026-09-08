-- ============================================================
-- Fix schema mismatches between code and database
-- ============================================================

-- 1. Add invite_code to profiles (for coaches)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- 2. Add opponent to matches (player logs opponent name)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS opponent TEXT;

-- 3. Expand player_goals with missing fields
ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

-- 4. Recognition/awards table
CREATE TABLE IF NOT EXISTS public.recognition_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id UUID NOT NULL,
  squad_player_id UUID NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  award_type TEXT NOT NULL,
  awarded_for TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.recognition_awards ENABLE ROW LEVEL SECURITY;

-- 5. RLS: parents can read squad_players for their child
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'squad_players'
    AND policyname = 'Parents read squad players for child'
  ) THEN
    CREATE POLICY "Parents read squad players for child"
      ON public.squad_players FOR SELECT TO authenticated
      USING (
        linked_player_id IN (
          SELECT player_user_id FROM public.player_parent_links
          WHERE parent_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 6. RLS: parents can read coach_assessments for their child
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coach_assessments'
    AND policyname = 'Parents read assessments for child'
  ) THEN
    CREATE POLICY "Parents read assessments for child"
      ON public.coach_assessments FOR SELECT TO authenticated
      USING (
        squad_player_id IN (
          SELECT sp.id FROM public.squad_players sp
          JOIN public.player_parent_links ppl ON sp.linked_player_id = ppl.player_user_id
          WHERE ppl.parent_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 7. RLS: players can read their own squad_player record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'squad_players'
    AND policyname = 'Players read own squad record'
  ) THEN
    CREATE POLICY "Players read own squad record"
      ON public.squad_players FOR SELECT TO authenticated
      USING (linked_player_id = auth.uid());
  END IF;
END $$;

-- 8. RLS: players can read their own assessments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coach_assessments'
    AND policyname = 'Players read own assessments'
  ) THEN
    CREATE POLICY "Players read own assessments"
      ON public.coach_assessments FOR SELECT TO authenticated
      USING (
        squad_player_id IN (
          SELECT id FROM public.squad_players WHERE linked_player_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 9. RLS: anyone authenticated can look up a coach by invite_code (for linking during onboarding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
    AND policyname = 'Anyone can look up coach by invite code'
  ) THEN
    CREATE POLICY "Anyone can look up coach by invite code"
      ON public.profiles FOR SELECT TO authenticated
      USING (role = 'coach' AND invite_code IS NOT NULL);
  END IF;
END $$;

-- 10. RLS: recognition_awards policies
CREATE POLICY "Coaches manage own awards"
  ON public.recognition_awards FOR ALL TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

CREATE POLICY "Players read own awards"
  ON public.recognition_awards FOR SELECT TO authenticated
  USING (
    squad_player_id IN (
      SELECT id FROM public.squad_players WHERE linked_player_id = auth.uid()
    )
  );

CREATE POLICY "Parents read awards for child"
  ON public.recognition_awards FOR SELECT TO authenticated
  USING (
    squad_player_id IN (
      SELECT sp.id FROM public.squad_players sp
      JOIN public.player_parent_links ppl ON sp.linked_player_id = ppl.player_user_id
      WHERE ppl.parent_user_id = auth.uid()
    )
  );
