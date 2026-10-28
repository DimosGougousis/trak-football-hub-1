-- TRAK-285 (Games 3/8, spec TRAK-282): plan step 2, line-up and jobs. The plan gets its format (11, 9, 7 or 5 a
-- side) and formation, and each player who can come gets one row: starter (in one slot), bench or not selected,
-- their job, a note for them alone, context and the coach's expectation.
--
-- Like game_plans, these rows are the coach's working copy and only the match's coach ever reads or writes them.
-- Players and families will read copies that Share writes (TRAK-286): the job for the player and their family, the
-- note for the player alone, never the context or the expectation before the evaluation is published.
-- A row is written only for a consented child on the coach's current roster in the match's squad, as attendance
-- confirmations are checked. Writes need the games switch on and a match that isn't cancelled. Nobody deletes a row:
-- rows go with their match.

-- A shape such as 4-3-3 fits a format when its lines add up to the outfield players.
CREATE FUNCTION trak_private.formation_fits(shape text, players smallint) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN shape ~ '^[1-9](-[1-9]){1,4}$'
    THEN (SELECT sum(part::int) FROM unnest(string_to_array(shape, '-')) AS part) = players - 1
    ELSE false END
$$;
REVOKE ALL ON FUNCTION trak_private.formation_fits(text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.formation_fits(text, smallint) TO authenticated, service_role;

ALTER TABLE public.game_plans
  ADD COLUMN format smallint NOT NULL DEFAULT 11 CHECK (format IN (5, 7, 9, 11)),
  ADD COLUMN formation text,
  ADD CONSTRAINT game_plans_formation_fits CHECK (formation IS NULL OR trak_private.formation_fits(formation, format));

-- The caller coaches the match, and the child is on their current roster, in the match's squad and academy, with
-- consent in place: the checks attendance confirmations make (trak_private.confirmation_target).
CREATE FUNCTION trak_private.game_plan_player_ok(p_event_id uuid, p_squad_player_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_calendar_events e
    JOIN public.squad_players sp ON sp.id = p_squad_player_id
    WHERE e.id = p_event_id
      AND e.coach_user_id = (SELECT auth.uid())
      AND public.squad_player_is_mine(sp.id)
      AND sp.coach_user_id = e.coach_user_id
      AND sp.organization_id IS NOT DISTINCT FROM e.organization_id
      AND sp.status <> 'coach_departed'
      AND (e.squad IS NULL OR sp.age_group = e.squad)
      AND NOT public.coach_squad_player_consent_required(sp.id)
  );
$$;
REVOKE ALL ON FUNCTION trak_private.game_plan_player_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.game_plan_player_ok(uuid, uuid) TO authenticated, service_role;

CREATE TABLE public.game_plan_players (
  event_id uuid NOT NULL REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  -- Someone who can come and isn't on the pitch is on the bench until the coach says otherwise (Imad, 28 Oct).
  role text NOT NULL DEFAULT 'bench' CHECK (role IN ('starter', 'bench', 'not_selected')),
  -- The starter's place in the formation: 1 is the keeper, then each line from the back, left to right.
  slot smallint CHECK (slot BETWEEN 1 AND 11),
  job text NOT NULL DEFAULT '' CHECK (char_length(job) <= 300),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  -- What the coach takes into account. Never a diagnosis.
  context text[] NOT NULL DEFAULT '{}'
    CHECK (context <@ ARRAY['out_of_position', 'first_start', 'back_from_injury', 'young_for_age_group', 'playing_up']),
  expectation text NOT NULL DEFAULT 'usual' CHECK (expectation IN ('stretch', 'usual', 'lead')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, squad_player_id),
  CONSTRAINT game_plan_players_slot_for_starters CHECK ((role = 'starter') = (slot IS NOT NULL)),
  -- A player left out gets their note and nothing else.
  CONSTRAINT game_plan_players_left_out_note_only CHECK (role <> 'not_selected' OR (job = '' AND context = '{}' AND expectation = 'usual')),
  -- Checked at the end of each statement, so two starters can swap slots in one save.
  CONSTRAINT game_plan_players_one_per_slot UNIQUE (event_id, slot) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE TRIGGER game_plan_players_updated_at BEFORE UPDATE ON public.game_plan_players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.game_plan_players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_plan_players FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.game_plan_players TO authenticated;

CREATE POLICY "Coaches read their own line-ups" ON public.game_plan_players
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plan_players.event_id AND e.coach_user_id = (SELECT auth.uid())));
CREATE POLICY "Coaches place their own players" ON public.game_plan_players
  FOR INSERT TO authenticated
  WITH CHECK (public.is_coach() AND trak_private.game_plan_player_ok(event_id, squad_player_id));
CREATE POLICY "Coaches change their own line-ups" ON public.game_plan_players
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_plan_players.event_id AND e.coach_user_id = (SELECT auth.uid())))
  WITH CHECK (public.is_coach() AND trak_private.game_plan_player_ok(event_id, squad_player_id));

-- Restrictive, as game_plans' are: no stray grant or permissive rule can open writes for an academy that is off,
-- to a training or a cancelled match, or for a child the coach can't record.
CREATE POLICY "Switch, open match and child gate line-up inserts" ON public.game_plan_players
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('games'))
    AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
      WHERE e.id = game_plan_players.event_id AND e.event_type = 'match' AND e.status <> 'cancelled')
    AND trak_private.game_plan_player_ok(event_id, squad_player_id));
CREATE POLICY "Switch, open match and child gate line-up updates" ON public.game_plan_players
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_coach() AND (SELECT public.feature_on('games'))
    AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
      WHERE e.id = game_plan_players.event_id AND e.event_type = 'match' AND e.status <> 'cancelled'))
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('games'))
    AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
      WHERE e.id = game_plan_players.event_id AND e.event_type = 'match' AND e.status <> 'cancelled')
    AND trak_private.game_plan_player_ok(event_id, squad_player_id));
