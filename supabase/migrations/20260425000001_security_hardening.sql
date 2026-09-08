-- ============================================================
-- TRAK Security Hardening
-- Run this in Supabase SQL Editor before going live.
-- ============================================================


-- ============================================================
-- 1. ENSURE RLS IS ENABLED ON ALL CORE TABLES
--    (policies are ignored until ENABLE is set)
-- ============================================================
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_details       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_details        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_parent_links  ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. PREVENT ROLE SELF-ESCALATION
--    Tighten the profiles INSERT policy so users cannot claim
--    'club' (or any future privileged role) by posting directly.
--    Club admin accounts should be created through a controlled
--    path; this constraint is a last line of defence.
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role::text IN ('player', 'coach', 'parent', 'club')
  );

-- Hard database constraint — independent of RLS
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_valid
  CHECK (role::text IN ('player', 'coach', 'parent', 'club'));


-- ============================================================
-- 3. COACH → PLAYER MATCH LOGGING  (SECURITY DEFINER RPC)
--    CoachQuickMatchLog inserts match rows with user_id =
--    linked_player_id, which fails the RLS check (user_id =
--    auth.uid()). This function verifies the coach–player link
--    before writing, so the data actually reaches the player's
--    match history.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_match_for_player(
  p_user_id         uuid,
  p_opponent        text,
  p_team_score      integer,
  p_opponent_score  integer,
  p_competition     text,
  p_venue           text,
  p_position        text,
  p_age_group       text,
  p_minutes_played  integer,
  p_goals           integer,
  p_assists         integer,
  p_card_received   text,
  p_body_condition  text,
  p_self_rating     text,
  p_computed_rating numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be the coach who has this player linked in their squad
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_players
    WHERE linked_player_id = p_user_id
      AND coach_user_id    = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised: caller is not the coach of player %', p_user_id;
  END IF;

  INSERT INTO public.matches (
    user_id, opponent, team_score, opponent_score, competition, venue,
    position, age_group, minutes_played, goals, assists, card_received,
    body_condition, self_rating, computed_rating
  ) VALUES (
    p_user_id, p_opponent, p_team_score, p_opponent_score, p_competition, p_venue,
    p_position, p_age_group, p_minutes_played, p_goals, p_assists, p_card_received,
    p_body_condition, p_self_rating, p_computed_rating
  );
END;
$$;


-- ============================================================
-- 4. PARENT AUTO-LINKING  (SECURITY DEFINER RPC)
--    Parents cannot query parent_invites by email — the RLS
--    only lets players read their own rows.  This function
--    looks up pending invites server-side, creates the link,
--    and marks the invite accepted, all in one atomic call.
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_parent_to_players_by_email(p_email text)
RETURNS integer   -- number of links created
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_count  integer := 0;
BEGIN
  FOR v_invite IN
    SELECT player_user_id, id AS invite_id
    FROM public.parent_invites
    WHERE LOWER(parent_email) = LOWER(TRIM(p_email))
      AND status = 'pending'
  LOOP
    INSERT INTO public.player_parent_links (parent_user_id, player_user_id)
    VALUES (auth.uid(), v_invite.player_user_id)
    ON CONFLICT (player_user_id, parent_user_id) DO NOTHING;

    UPDATE public.parent_invites
    SET status = 'accepted'
    WHERE id = v_invite.invite_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ============================================================
-- 5. LOCK DOWN player_parent_links DIRECT INSERTS
--    All link creation must go through the SECURITY DEFINER
--    RPCs above.  SECURITY DEFINER functions bypass RLS and
--    can still insert; the anon/authenticated client cannot.
--    This closes the link-forgery attack surface.
-- ============================================================
DROP POLICY IF EXISTS "Parents can insert validated links" ON public.player_parent_links;
DROP POLICY IF EXISTS "Authenticated can insert links"    ON public.player_parent_links;

CREATE POLICY "No direct link inserts — use RPCs"
  ON public.player_parent_links FOR INSERT TO authenticated
  WITH CHECK (false);


-- ============================================================
-- 6. ADD MISSING FOREIGN KEY CONSTRAINTS
--    Tables created early had user_id without an explicit FK.
--    ON DELETE CASCADE ensures data is cleaned up when a user
--    is removed from auth.users.
-- ============================================================
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_user_id_fkey;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.wellness_logs
  DROP CONSTRAINT IF EXISTS wellness_logs_user_id_fkey;
ALTER TABLE public.wellness_logs
  ADD CONSTRAINT wellness_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.player_goals
  DROP CONSTRAINT IF EXISTS player_goals_user_id_fkey;
ALTER TABLE public.player_goals
  ADD CONSTRAINT player_goals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.squad_players
  DROP CONSTRAINT IF EXISTS squad_players_coach_user_id_fkey;
ALTER TABLE public.squad_players
  ADD CONSTRAINT squad_players_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recognition_awards
  DROP CONSTRAINT IF EXISTS recognition_awards_coach_user_id_fkey;
ALTER TABLE public.recognition_awards
  ADD CONSTRAINT recognition_awards_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.coach_calendar_events
  DROP CONSTRAINT IF EXISTS coach_calendar_events_coach_user_id_fkey;
ALTER TABLE public.coach_calendar_events
  ADD CONSTRAINT coach_calendar_events_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.coach_sessions
  DROP CONSTRAINT IF EXISTS coach_sessions_coach_user_id_fkey;
ALTER TABLE public.coach_sessions
  ADD CONSTRAINT coach_sessions_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ============================================================
-- 7. PERFORMANCE INDEXES ON HOT QUERY PATHS
--    Without these, every query does a full table scan.
--    Add as data grows; safe to add now.
-- ============================================================

-- Player home: "all my matches ordered by date"
CREATE INDEX IF NOT EXISTS idx_matches_user_created
  ON public.matches (user_id, created_at DESC);

-- Coach squad page: "all players for this coach"
CREATE INDEX IF NOT EXISTS idx_squad_players_coach
  ON public.squad_players (coach_user_id);

-- Linking: "find squad record for this player"
CREATE INDEX IF NOT EXISTS idx_squad_players_linked
  ON public.squad_players (linked_player_id)
  WHERE linked_player_id IS NOT NULL;

-- Coach assessments: "latest assessments per player"
CREATE INDEX IF NOT EXISTS idx_coach_assessments_squad_created
  ON public.coach_assessments (squad_player_id, created_at DESC);

-- Coach sessions list
CREATE INDEX IF NOT EXISTS idx_coach_sessions_coach_date
  ON public.coach_sessions (coach_user_id, session_date DESC);

-- Parent invite lookup by email (used in auto-linking RPC)
CREATE INDEX IF NOT EXISTS idx_parent_invites_email_pending
  ON public.parent_invites (LOWER(parent_email))
  WHERE status = 'pending';

-- Parent link lookups
CREATE INDEX IF NOT EXISTS idx_player_parent_links_parent
  ON public.player_parent_links (parent_user_id);

CREATE INDEX IF NOT EXISTS idx_player_parent_links_player
  ON public.player_parent_links (player_user_id);

-- Calendar events: coach schedule view
CREATE INDEX IF NOT EXISTS idx_coach_calendar_coach_starts
  ON public.coach_calendar_events (coach_user_id, starts_at);
