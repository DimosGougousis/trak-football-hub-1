-- TRAK-284 (Games 2/8, spec TRAK-282): a match's game plan, step 1 (opponent and goals), saved as a draft only
-- its coach sees. One plan per match event. No player, guardian, other coach or academy admin ever reads it:
-- players and families will read copies that Share writes (TRAK-286). How strong the opponent is, their line-up
-- and scouting stay coach-only for good (TRAK-289).
--
-- Writes need the academy's games switch on and a match that isn't cancelled, enforced as events' switch is.
-- Reads don't need the switch, so switching Games off hides the tab without losing a plan. Nobody deletes a
-- plan: it goes with its match (a published match is cancelled, never deleted). TRAK-286 adds when a plan was
-- shared; until then every plan is a draft.

-- Their key players: shirt number (1 to 99, or not known), position and a note, at most 11. No names: they are
-- another club's children.
CREATE FUNCTION trak_private.valid_key_players(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE player jsonb;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(value) > 11 THEN RETURN false; END IF;
 FOR player IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF jsonb_typeof(player) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(player) k WHERE k NOT IN ('number', 'position', 'note')) THEN RETURN false; END IF;
  IF NOT COALESCE(jsonb_typeof(player->'position') = 'string' AND char_length(player->>'position') <= 40
    AND jsonb_typeof(player->'note') = 'string' AND char_length(player->>'note') <= 300, false) THEN RETURN false; END IF;
  IF jsonb_typeof(player->'number') = 'number' THEN
   IF NOT ((player->>'number')::numeric BETWEEN 1 AND 99 AND (player->>'number')::numeric % 1 = 0) THEN RETURN false; END IF;
  ELSIF COALESCE(jsonb_typeof(player->'number'), 'null') <> 'null' THEN RETURN false;
  END IF;
 END LOOP;
 RETURN true;
END $$;

-- Up to three goals for the team: a title and what it looks like. A draft may hold a goal with no title yet.
CREATE FUNCTION trak_private.valid_game_goals(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE goal jsonb;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(value) > 3 THEN RETURN false; END IF;
 FOR goal IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF jsonb_typeof(goal) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(goal) k WHERE k NOT IN ('title', 'looks_like')) THEN RETURN false; END IF;
  IF NOT COALESCE(jsonb_typeof(goal->'title') = 'string' AND char_length(goal->>'title') <= 80
    AND jsonb_typeof(goal->'looks_like') = 'string' AND char_length(goal->>'looks_like') <= 300, false) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION trak_private.valid_key_players(jsonb), trak_private.valid_game_goals(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.valid_key_players(jsonb), trak_private.valid_game_goals(jsonb) TO authenticated, service_role;

CREATE TABLE public.game_plans (
  event_id uuid PRIMARY KEY REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  -- Unset until the coach picks.
  strength text CHECK (strength IN ('weaker', 'similar', 'stronger')),
  -- Their likely shape, such as 4-4-2. Unset when the coach isn't sure.
  their_formation text CHECK (their_formation ~ '^[1-9](-[1-9]){1,4}$'),
  key_players jsonb NOT NULL DEFAULT '[]' CHECK (trak_private.valid_key_players(key_players)),
  scouting text NOT NULL DEFAULT '' CHECK (char_length(scouting) <= 2000),
  goals jsonb NOT NULL DEFAULT '[]' CHECK (trak_private.valid_game_goals(goals)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER game_plans_updated_at BEFORE UPDATE ON public.game_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.game_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.game_plans TO authenticated;

-- A plan's coach is its match's coach.
CREATE POLICY "Coaches read their own game plans" ON public.game_plans
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plans.event_id AND e.coach_user_id = (SELECT auth.uid())));
CREATE POLICY "Coaches start their own game plans" ON public.game_plans
  FOR INSERT TO authenticated
  WITH CHECK (public.is_coach() AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plans.event_id AND e.coach_user_id = (SELECT auth.uid())));
CREATE POLICY "Coaches change their own game plans" ON public.game_plans
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plans.event_id AND e.coach_user_id = (SELECT auth.uid())))
  WITH CHECK (public.is_coach() AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plans.event_id AND e.coach_user_id = (SELECT auth.uid())));

-- Restrictive, as events' switch is: no stray grant or permissive rule can open writes for an academy that is
-- off, or to a plan for a training or a cancelled match.
CREATE POLICY "Games switch and an open match gate plan inserts" ON public.game_plans
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('games')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plans.event_id AND e.event_type = 'match' AND e.status <> 'cancelled'));
CREATE POLICY "Games switch and an open match gate plan updates" ON public.game_plans
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_coach() AND (SELECT public.feature_on('games')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plans.event_id AND e.event_type = 'match' AND e.status <> 'cancelled'))
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('games')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plans.event_id AND e.event_type = 'match' AND e.status <> 'cancelled'));
