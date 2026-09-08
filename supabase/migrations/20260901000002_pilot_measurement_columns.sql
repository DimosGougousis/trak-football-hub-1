-- Pilot measurement columns.
--
-- Two scorecard metrics cannot be computed from the current `matches` shape:
--
--   Match coverage  — needs the date the match was PLAYED. `created_at` is the
--                     date it was LOGGED, which drifts whenever a player or
--                     coach catches up days later.
--   Assessment rate — "within 48 hours" is only honest measured from the match,
--                     and the pilot needs to separate player-logged matches from
--                     coach-logged ones (UC-05 vs UC-06) to read H1 correctly.

-- 1. When the match was played, and who entered it -------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_date      date,
  ADD COLUMN IF NOT EXISTS logged_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logged_by_role  text;

-- Backfill: pre-pilot rows are treated as played on the day they were logged,
-- and as self-logged, which is how every pre-pilot row was in fact created.
UPDATE public.matches
   SET match_date = created_at::date
 WHERE match_date IS NULL;

UPDATE public.matches
   SET logged_by = user_id, logged_by_role = 'player'
 WHERE logged_by IS NULL;

ALTER TABLE public.matches
  ALTER COLUMN match_date SET DEFAULT CURRENT_DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_logged_by_role_check'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_logged_by_role_check
      CHECK (logged_by_role IN ('player', 'coach'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS matches_match_date_idx ON public.matches (match_date DESC);
CREATE INDEX IF NOT EXISTS matches_user_match_date_idx ON public.matches (user_id, match_date DESC);

-- 2. Stamp the actor on every insert path ----------------------------------
-- A trigger rather than client code, so the player insert, the coach RPC and
-- any future path are all covered without being remembered individually.
-- auth.uid() reads the request JWT, so it still returns the CALLER inside the
-- SECURITY DEFINER RPC — which is exactly the coach we want to record.

CREATE OR REPLACE FUNCTION public.stamp_match_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.match_date IS NULL THEN
    NEW.match_date := CURRENT_DATE;
  END IF;

  IF NEW.logged_by IS NULL THEN
    NEW.logged_by := auth.uid();
  END IF;

  IF NEW.logged_by_role IS NULL THEN
    NEW.logged_by_role := CASE
      WHEN NEW.logged_by IS NOT DISTINCT FROM NEW.user_id THEN 'player'
      ELSE 'coach'
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_match_actor_trg ON public.matches;
CREATE TRIGGER stamp_match_actor_trg
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.stamp_match_actor();

-- 3. Let the coach RPC carry a real match date -----------------------------
-- The old 15-argument signature is dropped rather than left in place: adding a
-- defaulted parameter would leave both resolvable from a 15-argument call and
-- Postgres would reject it as ambiguous.

DROP FUNCTION IF EXISTS public.log_match_for_player(
  uuid, text, integer, integer, text, text, text, text,
  integer, integer, integer, text, text, text, numeric
);

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
  p_computed_rating numeric,
  p_match_date      date DEFAULT CURRENT_DATE
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
    body_condition, self_rating, computed_rating,
    match_date, logged_by, logged_by_role
  ) VALUES (
    p_user_id, p_opponent, p_team_score, p_opponent_score, p_competition, p_venue,
    p_position, p_age_group, p_minutes_played, p_goals, p_assists, p_card_received,
    p_body_condition, p_self_rating, p_computed_rating,
    COALESCE(p_match_date, CURRENT_DATE), auth.uid(), 'coach'
  );
END;
$$;

COMMENT ON COLUMN public.matches.match_date IS 'Date the match was played (not logged). Drives pilot match-coverage and 48h assessment metrics.';
COMMENT ON COLUMN public.matches.logged_by_role IS 'player = self-logged (UC-05), coach = logged on the player''s behalf (UC-06).';
